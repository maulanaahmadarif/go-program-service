type JsonValue = string | Array<Record<string, string>>;
interface JsonItem {
  label: string;
  value: JsonValue;
}

export function formatJsonToLabelValueString(json: JsonItem[]): string {
  let result = "";

  // Find company and job entries
  const companyEntry = json.find(item => item.label.toLowerCase() === 'company');
  const jobEntry = json.find(item => item.label.toLowerCase() === 'job');
  const productsEntry = json.find(item => item.label.toLowerCase() === 'products');

  // Add company and job
  if (companyEntry && typeof companyEntry.value === 'string') {
    result += `Company: ${companyEntry.value}\n`;
  }
  if (jobEntry && typeof jobEntry.value === 'string') {
    result += `Job: ${jobEntry.value}\n`;
  }

  // Add a blank line before product section
  result += '\n';

  // Add Product section if products exist
  if (productsEntry && Array.isArray(productsEntry.value) && productsEntry.value.length > 0) {
    result += 'Product:\n';
    const productData = productsEntry.value[0]; // Get the first product

    // Add product details in specific order
    if (productData.productCategory) {
      result += `Product Category: ${productData.productCategory}\n`;
    }
    if (productData.productType) {
      result += `Product Type: ${productData.productType}\n`;
    }
    if (productData.numberOfQuantity) {
      result += `Quantity: ${productData.numberOfQuantity}\n`;
    }
    if (productData.document) {
      result += `Document: ${productData.document}\n`;
    }
  }

  return result.trim();
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