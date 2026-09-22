export function isPortableJsonValue(value) {
    return isPortableJsonValueInternal(value, new WeakSet());
}
function isPortableJsonValueInternal(value, ancestors) {
    if (value === null)
        return true;
    if (typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (typeof value !== 'object')
        return false;
    if (ancestors.has(value))
        return false;
    ancestors.add(value);
    let valid;
    if (Array.isArray(value)) {
        valid = value.every((item) => isPortableJsonValueInternal(item, ancestors));
    }
    else {
        const prototype = Object.getPrototypeOf(value);
        valid =
            (prototype === Object.prototype || prototype === null) &&
                Object.values(value).every((item) => isPortableJsonValueInternal(item, ancestors));
    }
    ancestors.delete(value);
    return valid;
}
export function utf8ByteLength(value) {
    let bytes = 0;
    for (const character of value) {
        const codePoint = character.codePointAt(0);
        if (codePoint === undefined)
            continue;
        if (codePoint <= 0x7f)
            bytes += 1;
        else if (codePoint <= 0x7ff)
            bytes += 2;
        else if (codePoint <= 0xffff)
            bytes += 3;
        else
            bytes += 4;
    }
    return bytes;
}
//# sourceMappingURL=json-boundary.js.map