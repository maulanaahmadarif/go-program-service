type JsonValue = string | Array<Record<string, string>>;
interface JsonItem {
  label: string;
  value: JsonValue;
}

export function formatJsonToLabelValueString(json: JsonItem[]): string {
  let result = "";

  json.forEach((item) => {
    if (typeof item.value === "string") {
      // If value is a string, format directly
      result += `${item.label}: ${item.value}\n`;
    } else if (Array.isArray(item.value)) {
      // If value is an array, process each object in the array
      result += `${item.label}:\n`;
      item.value.forEach((subItem) => {
        Object.entries(subItem).forEach(([key, value]) => {
          result += `${mapLabelToDifferentLabel(key)}: ${value}\n`; // Indent for array objects
        });
      });
    }
  });

  return result.trim(); // Remove trailing newline
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
  // Add other mappings as needed
};

export function mapLabelToDifferentLabel(inputLabel: string): string {
  return labelMap[inputLabel] || inputLabel; // Returns the mapped label or the original if not found
}