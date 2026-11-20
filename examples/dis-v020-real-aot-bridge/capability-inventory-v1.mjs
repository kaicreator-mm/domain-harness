/**
 * DIS v0.2.0 R6.1 — separately selected inventory stock preview Capability.
 * Pure OperationCall: no external resource/Effect. The selected visibility
 * is bound to the inventory Domain's reserveInventory Intent only.
 */
export const MODULE_ID='capability-inventory@v08.1.0.0';
export const PACKAGE_KIND='capability';
export const ABI_VERSION='v08-capability-abi/1';
export const ENDPOINTS=[{endpointId:'capability:inventory-stock',kind:'capability-endpoint'}];
export const OPERATIONS=[{
 operationId:'stock.preview',effectClass:'none',visibility:{intentType:'reserveInventory'}
}];
export function previewStock(input){
 if(arguments.length!==1)throw new Error('stock.preview requires exactly one bounded plain-data argument');
 const record=input===null||typeof input!=='object'?{}:input;
 const quantity=Number(record.quantity);
 if(!Number.isFinite(quantity)||quantity<=0||!Number.isInteger(quantity))
  throw new Error('stock.preview requires a positive integer quantity');
 if(typeof record.sku!=='string'||!record.sku)
  throw new Error('stock.preview requires sku');
 return {ok:true,sku:record.sku,quantity,canReserve:true};
}