// Pinia also checks own properties during hydration on iOS 15.0–15.3.
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    configurable: true,
    writable: true,
    value: (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key),
  })
}
