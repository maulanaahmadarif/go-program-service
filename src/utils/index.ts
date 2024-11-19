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
          result += `  ${key}: ${value}\n`; // Indent for array objects
        });
      });
    }
  });

  return result.trim(); // Remove trailing newline
}