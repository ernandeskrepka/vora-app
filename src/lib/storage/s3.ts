import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";
import type { StorageDriver } from "./index.ts";

/** Cloudflare R2 ou AWS S3 (mesma API). */
export function s3StorageDriver(): StorageDriver {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("STORAGE_DRIVER=s3 exige S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.");
  }

  const client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const Bucket = env.S3_BUCKET;

  return {
    nome: "s3",
    async salvar(key, conteudo, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: conteudo, ContentType: contentType }),
      );
    },
    async ler(key) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      const chunks: Buffer[] = [];
      for await (const chunk of r.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
    async remover(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async urlTemporaria(key, ttlSegundos = env.S3_SIGNED_URL_TTL_SECONDS) {
      // Com dominio publico configurado no bucket, serve direto.
      if (env.S3_PUBLIC_BASE_URL) {
        return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
      }
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: ttlSegundos,
      });
    },
  };
}
