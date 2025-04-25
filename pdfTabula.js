const fs = require("fs");
const path = require("path");
const tabula = require("tabula-js");

// Configure path to your PDF
// const pdfPath = path.resolve("./pdfs/sample-tables.pdf");
const pdfPath = path.resolve("./pdfs/sample-tables.pdf").replace(/\\/g, "/");


// Function to extract tables using Tabula
async function extractTablesFromPDF(pdfPath) {
  try {
    console.log(`Extracting tables from: ${pdfPath}`);

    // Create a tabula instance for the PDF
    const tabulaExtractor = tabula(pdfPath, {
      // Tabula options
      pages: "all", // Extract from all pages
      area: null, // Extract from entire page
      spreadsheet: true, // Force spreadsheet mode for better table detection
    });

    // Extract tables
    const tables = await new Promise((resolve, reject) => {
      tabulaExtractor.extractCsv((err, csvData) => {
        if (err) return reject(err);

        // csvData is an array of CSV strings, one for each detected table
        resolve(csvData);
      });
    });

    // Process each extracted table (CSV format) into JSON
    const processedTables = [];

    tables.forEach((csvTable, index) => {
      // Skip empty tables
      if (!csvTable || csvTable.trim() === "") return;

      // Parse CSV data
      const rows = csvTable
        .split("\n")
        .filter((row) => row.trim() !== "")
        .map((row) => {
          // Handle CSV parsing (respecting quotes)
          const cells = [];
          let currentCell = "";
          let inQuotes = false;

          for (let i = 0; i < row.length; i++) {
            const char = row[i];

            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === "," && !inQuotes) {
              cells.push(currentCell.trim());
              currentCell = "";
            } else {
              currentCell += char;
            }
          }

          // Add the last cell
          cells.push(currentCell.trim());
          return cells;
        });

      // First row as headers
      const headers = rows[0] || [];

      // Process data rows (skip header)
      const data = rows.slice(1).map((row) => {
        const rowObj = {};
        row.forEach((cell, cellIndex) => {
          // Use header as key if available, otherwise use column index
          const key =
            headers[cellIndex] && headers[cellIndex].trim()
              ? headers[cellIndex].trim()
              : `Column${cellIndex + 1}`;
          rowObj[key] = cell.trim();
        });
        return rowObj;
      });

      // Add table to results
      processedTables.push({
        tableIndex: index + 1,
        title: `Table ${index + 1}`,
        headers: headers,
        data: data,
      });
    });

    return processedTables;
  } catch (error) {
    console.error("Error extracting tables:", error);
    throw error;
  }
}

// Execute the extraction
extractTablesFromPDF(pdfPath)
  .then((tables) => {
    console.log(`Successfully extracted ${tables.length} tables`);

    // Write the tables to a JSON file
    fs.writeFileSync("extracted-tables.json", JSON.stringify(tables, null, 2));

    console.log("Tables saved to extracted-tables.json");
  })
  .catch((error) => {
    console.error("Failed to extract tables:", error);
  });
