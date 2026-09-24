import { GridFSBucket, MongoClient } from "mongodb";

const DEFAULT_DATABASE = "ux_audit_tool";
const REPORT_BUCKET = "audit_reports";

declare global {
  var __uxAuditMongoClientPromise: Promise<MongoClient> | undefined;
}

function connectionUri() {
  return process.env.MONGODB_URI?.trim() || "";
}

export function isMongoConfigured() {
  return Boolean(connectionUri());
}

async function getMongoClient() {
  const uri = connectionUri();
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  if (!global.__uxAuditMongoClientPromise) {
    global.__uxAuditMongoClientPromise = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 8_000,
    }).connect();
  }

  return global.__uxAuditMongoClientPromise;
}

export async function getReportGridFsBucket() {
  const client = await getMongoClient();
  const database = process.env.MONGODB_DB?.trim() || DEFAULT_DATABASE;
  return new GridFSBucket(client.db(database), { bucketName: REPORT_BUCKET });
}
