import type { DomainMessage, MessageAcceptedAck } from '../../v2/contracts/message.js';
import { type DomainMessageAcceptanceBoundary, type MessageAcceptanceDependencies } from '../contracts/message-acceptance.js';
export declare class DomainMessageAcceptance implements DomainMessageAcceptanceBoundary {
    private readonly store;
    private readonly packages;
    private readonly payloadValidator;
    constructor(dependencies: MessageAcceptanceDependencies);
    accept(message: DomainMessage): Promise<MessageAcceptedAck>;
}
//# sourceMappingURL=domain-message-acceptance.d.ts.map