export declare const TINY_PNG: Buffer<ArrayBuffer>;
export declare const SAMPLE_CSV = "id,nombre,valor\n1,Producto Alpha,100\n2,Producto Beta,200\n";
export declare function buildMultipart(filename: string, content: Buffer | string, mimetype: string, fields?: Record<string, string>): {
    payload: Buffer<ArrayBuffer>;
    headers: {
        'content-type': string;
    };
};
export interface InMemoryDb {
    users: any[];
    folders: any[];
    folderMembers: any[];
    images: any[];
    tables: any[];
}
export declare function setupInMemoryE2EDb(): Promise<{
    state: InMemoryDb;
    teardown: () => void;
}>;
//# sourceMappingURL=e2e.helper.d.ts.map