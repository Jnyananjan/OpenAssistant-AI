// supabase/functions/deno.d.ts
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
  };
  export function serve(handler: (req: Request) => Promise<Response> | Response): void;
}
