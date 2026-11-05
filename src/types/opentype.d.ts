declare module 'opentype.js' {
  export interface RenderOptions {
    kerning?: boolean;
    features?: Record<string, boolean>;
    letterSpacing?: number;
    tracking?: number;
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    getAdvanceWidth(text: string, fontSize?: number, options?: RenderOptions): number;
  }

  export function parse(buffer: ArrayBuffer): Font;

  const opentype: {
    parse(buffer: ArrayBuffer): Font;
  };

  export default opentype;
}
