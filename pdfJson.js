var json;
const fs = require("fs");
const pdfParse = require("pdf-parse");

// Read PDF buffer
const pdfBuffer = fs.readFileSync("./pdfs/Abhishek_Shivanand_Karabani.pdf");


// This is related to data3.json and data3.txt
// const pdfBuffer = fs.readFileSync('./pdfs/cfile.pdf');


// Helper to parse simple key-value lines
function parseKeyValuePairs(text) {
  const lines = text.split("\n");
  const result = {};

  lines.forEach((line) => {
    const [key, ...rest] = line.split(":");
    if (key && rest.length > 0) {
      result[key.trim()] = rest.join(":").trim();
    }
  });

  return result;
}

// Extract text
pdfParse(pdfBuffer).then(function (data) {
  const text = data.text.replaceAll(" ", "");
  // console.log('Extracted Text:', text);
  fs.writeFileSync("data.txt", text);
  // Optional: Convert text to JSON
  json = parseKeyValuePairs(text);
  // console.log('JSON:', json);
  fs.writeFileSync("data2.json", JSON.stringify(json));
});
