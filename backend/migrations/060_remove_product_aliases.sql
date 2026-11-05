-- KTC 060: product_aliases is no longer part of the product master contract.
-- Run only after deploying code that resolves products by product_standards.product_code.
-- Back up the database before applying this migration.
DROP TABLE IF EXISTS product_aliases;
