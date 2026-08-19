function serializeExtraData(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return JSON.stringify(value);
    }
  }

  return JSON.stringify(value);
}

module.exports = { serializeExtraData };
