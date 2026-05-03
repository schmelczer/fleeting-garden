declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

declare const __BUILD_DATE__: number;
