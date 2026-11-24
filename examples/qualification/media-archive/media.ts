import type { CliElement } from '../shared/cli.js';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';

export type Policy = Readonly<{ revision: string; imageEdge: number; videoWidth: number; videoHeight: number; maxSeconds: number; maxBytes: number }>;
export const policy = Object.freeze({ revision:'archive-v1', imageEdge:320, videoWidth:320, videoHeight:240, maxSeconds:10, maxBytes:8*1024*1024 });
export const policyV2 = Object.freeze({ ...policy, revision:'archive-v2', imageEdge:160 });
export class FixityElement {
  async digest(path: string, limit: number): Promise<string> {
    if ((await stat(path)).size > limit) throw new Error('FILE_LIMIT');
    const bytes = await readFile(path);
    if (bytes.length > limit) throw new Error('FILE_LIMIT');
    return createHash('sha256').update(bytes).digest('hex');
  }
}
export type MediaInfo = { kind:'image'|'video'; width:number; height:number; seconds:number; frameSeconds?:number; containerSeconds?:number };
export class ImageElement {
  async inspect(path:string):Promise<MediaInfo> {
    const m=await sharp(path,{limitInputPixels:16_000_000}).metadata();
    if(!['png','jpeg'].includes(m.format??'')||!m.width||!m.height)throw new Error('IMAGE_FORMAT');
    return {kind:'image',width:m.autoOrient.width,height:m.autoOrient.height,seconds:0};
  }
  async verify(path:string):Promise<void>{ await sharp(path,{limitInputPixels:16_000_000}).raw().toBuffer(); }
  async derive(source:string,target:string,p:Policy):Promise<void> {
    await sharp(source,{limitInputPixels:16_000_000}).rotate().resize({width:p.imageEdge,height:p.imageEdge,fit:'inside',withoutEnlargement:true}).png().toFile(target);
  }
}
export class VideoElement {
  constructor(private readonly cli:CliElement,private readonly probe='ffprobe',private readonly convert='ffmpeg'){}
  async inspect(path:string):Promise<MediaInfo> {
    const raw=JSON.parse(await this.cli.run(this.probe,['-v','error','-show_format','-show_streams','-of','json',path]));
    const s=raw.streams?.find((x:{codec_type:string})=>x.codec_type==='video');
    const containerSeconds=Number(raw.format?.duration);
    const seconds=Number(s?.duration??containerSeconds);
    const [num,den]=String(s?.avg_frame_rate??'').split('/').map(Number);const frameSeconds=den!/num!;
    const brand=String(raw.format?.tags?.major_brand??'').trim();
    if(!['isom','iso2','iso5','iso6','mp41','mp42','avc1'].includes(brand))throw Error('VIDEO_CONTAINER');
    if((s?.sample_aspect_ratio&& !['1:1','N/A'].includes(s.sample_aspect_ratio))||s?.side_data_list?.some((v:{rotation?:number})=>v.rotation&&v.rotation!==0))throw Error('VIDEO_GEOMETRY_UNSUPPORTED');
    if(!s||!Number.isSafeInteger(s.width)||s.width<=0||!Number.isSafeInteger(s.height)||s.height<=0||!Number.isFinite(containerSeconds)||containerSeconds<=0||!Number.isFinite(seconds)||seconds<=0||!Number.isFinite(frameSeconds)||frameSeconds<=0||!String(raw.format?.format_name).split(',').includes('mp4'))throw new Error('VIDEO_METADATA');
    return {kind:'video',width:s.width,height:s.height,seconds,frameSeconds,containerSeconds};
  }
  async verify(path:string):Promise<void>{ await this.cli.run(this.convert,['-nostdin','-v','error','-xerror','-i',path,'-f','null','-']); }
  async derive(source:string,target:string,p:Policy):Promise<void>{
    await this.cli.run(this.convert,['-nostdin','-v','error','-xerror','-n','-i',source,'-map','0:v:0','-an','-vf',`scale=${p.videoWidth}:${p.videoHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,'-c:v','mpeg4',target]);
  }
}
