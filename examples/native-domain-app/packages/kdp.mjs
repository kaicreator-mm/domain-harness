/** 独立 Package 模块：KDP 是唯一 Order=0 Core。 */
export const packageMeta = { id:'reference-kdp', role:'core', order:0 };
export class Init {
  start(context) {
    if (context.appId !== 'native-domain-app') throw new Error('Invalid Domain App context');
  }
}
