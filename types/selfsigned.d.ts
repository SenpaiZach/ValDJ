declare module "selfsigned" {
  interface Options {
    keySize?: number;
    days?: number;
  }

  interface Attribute {
    name: string;
    value: string;
  }

  interface CertificateResult {
    private: string;
    public: string;
    cert: string;
  }

  export function generate(attributes?: Attribute[], options?: Options): CertificateResult;

  const selfsigned: {
    generate: typeof generate;
  };

  export default selfsigned;
}
