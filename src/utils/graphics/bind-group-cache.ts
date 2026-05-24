type BindGroupCacheKeys = readonly [object, ...object[]];

interface BindGroupCacheNode {
  bindGroup?: GPUBindGroup;
  children: WeakMap<object, BindGroupCacheNode>;
}

const createNode = (): BindGroupCacheNode => ({
  children: new WeakMap(),
});

const getOrCreateNode = (
  children: WeakMap<object, BindGroupCacheNode>,
  key: object
): BindGroupCacheNode => {
  let node = children.get(key);
  if (!node) {
    node = createNode();
    children.set(key, node);
  }
  return node;
};

export const createBindGroupCache = <Keys extends BindGroupCacheKeys>(
  factory: (...keys: Keys) => GPUBindGroup
): ((...keys: Keys) => GPUBindGroup) => {
  const root = new WeakMap<object, BindGroupCacheNode>();

  return (...keys) => {
    let node = getOrCreateNode(root, keys[0]);
    for (const key of keys.slice(1)) {
      node = getOrCreateNode(node.children, key);
    }

    node.bindGroup ??= factory(...keys);
    return node.bindGroup;
  };
};
