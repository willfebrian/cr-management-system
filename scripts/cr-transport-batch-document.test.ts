import assert from "node:assert/strict";
import test from "node:test";
import { buildCrTransportBatchArchive, type CrTransportDocument } from "../src/server/templates/crTransportTemplateService.js";

function readArchiveEntryNames(buffer: Buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

test("builds an archive with unique documents and a partial-failure README", async () => {
  const result = await buildCrTransportBatchArchive([101, 102, 103], async (issueId): Promise<CrTransportDocument> => {
    if (issueId === 102) throw new Error("Issue cancelled");
    return { filename: "CR Transport 26001-01.docx", buffer: Buffer.from(String(issueId)) };
  });

  assert.deepEqual(result.successfulIssueIds, [101, 103]);
  assert.deepEqual(result.failures, [{ issueId: 102, message: "Issue cancelled" }]);
  assert.deepEqual(readArchiveEntryNames(result.buffer), ["CR Transport 26001-01.docx", "CR Transport 26001-01 (2).docx", "README-gagal.txt"]);
  assert.match(result.filename, /^CR-Transport-Forms_\d{4}-\d{2}-\d{2}\.zip$/);
});

test("rejects an archive when no document can be generated", async () => {
  await assert.rejects(
    () => buildCrTransportBatchArchive([102], async () => { throw new Error("CR SAP belum tersedia"); }),
    /No CR Transport Form could be generated\./
  );
});
