type JsonPrimitive = string | number | boolean | null;
type JsonObject = Record<string, any>;
type JsonValue = JsonPrimitive | Array<JsonObject> | JsonObject;
interface JsonItem {
  label: string;
  value: JsonValue;
}

export function formatJsonToLabelValueString(json: JsonItem[]): string {
  if (!Array.isArray(json) || json.length === 0) return "";

  const lines: string[] = [];

  const productsEntry = json.find(
    (item) => item.label?.toLowerCase() === "products",
  );

  // 1) Print non-product fields first (company, job, invoiceDate, invoiceNumber, etc.)
  json.forEach((item) => {
    const label = item.label?.toLowerCase();
    if (!label || label === "products") return;

    const prettyLabel = mapLabelToDifferentLabel(item.label);
    const value = item.value as any;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      lines.push(`${prettyLabel}: ${value}`);
    } else if (value === null || value === undefined) {
      // skip empty
    } else {
      // fallback for unexpected objects
      try {
        lines.push(`${prettyLabel}: ${JSON.stringify(value)}`);
      } catch {
        lines.push(`${prettyLabel}: [object]`);
      }
    }
  });

  // spacer line before products
  lines.push("");

  // 2) Print products (supports multiple items and full schema)
  if (productsEntry && Array.isArray(productsEntry.value) && productsEntry.value.length > 0) {
    lines.push("Products:");

    const productKeysInOrder = [
      "productCategory",
      "productType",
      "numberOfQuantity",
      "partNumber",
      "description",
      "document",
      "excelDocument",
    ];

    (productsEntry.value as JsonObject[]).forEach((product, idx) => {
      lines.push(`- Product ${idx + 1}`);

      // Known keys in a fixed order
      productKeysInOrder.forEach((key) => {
        const v = (product as any)?.[key];
        if (v === undefined || v === null || v === "") return;
        lines.push(`  ${mapLabelToDifferentLabel(key)}: ${v}`);
      });

      // Any extra keys not in the known list
      Object.keys(product || {}).forEach((key) => {
        if (productKeysInOrder.includes(key)) return;
        const v = (product as any)?.[key];
        if (v === undefined || v === null || v === "") return;
        lines.push(`  ${mapLabelToDifferentLabel(key)}: ${v}`);
      });
    });
  }

  return lines.join("\n").trim();
}

export function getUserType(type: string): string {
  const userTypes: Record<string, string> = {
    T1: 'Distributor',
    T2: 'Partner/Reseller',
  };

  return userTypes[type] || type;
}

type LabelMapping = {
  [key: string]: string;
};

const labelMap: LabelMapping = {
  excelDocument: 'Excel Document',
  document: 'Document',
  productType: 'Product Type',
  productCategory: 'Product Category',
  numberOfQuantity: 'Quantity',
  job: 'Job',
  company: 'Company',
  meetingDate: 'Meeting Date',
  note: 'Note',
  quotationDate: 'Quotation Date',
  quotationNumber: 'Quotation Number',
  distributor: 'Distributor',
  invoiceDate: 'Invoice Date',
  invoiceNumber: 'Invoice Number',
  poDate: 'Purchase Order Date',
  poNumber: 'Purchase Order Number',
  total_company: 'Total Company',
  total_user: 'Total User',
  total_accomplishment_point: 'Total Accomplishment Point',
  total_company_point: 'Total Company Point',
  total_form_submission: 'Total Form Submission',
  partNumber: 'Part Number',
  description: 'Description',
  // Add other mappings as needed
};

export function mapLabelToDifferentLabel(inputLabel: string): string {
  return labelMap[inputLabel] || inputLabel; // Returns the mapped label or the original if not found
}