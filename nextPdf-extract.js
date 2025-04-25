const fs = require("fs");
const path = require("path");
const { PDFExtract } = require("pdf.js-extract");
const pdfExtract = new PDFExtract();

const pdfPath = path.resolve("./pdfs/sample-tables.pdf");

// Function to extract tables from PDF
async function extractTablesFromPDF(pdfPath) {
  try {
    console.log(`Extracting tables from: ${pdfPath}`);

    const result = await pdfExtract.extract(pdfPath, {});
    const allTables = [];
    let tableCounter = 1;

    // Process each page
    result.pages.forEach((page, pageIndex) => {
      console.log(`Processing page ${pageIndex + 1}`);

      // 1. First, identify table titles (they usually start with "Table X:")
      const tableTitlesInfo = findTableTitles(page.content);

      if (tableTitlesInfo.length > 0) {
        console.log(
          `Found ${tableTitlesInfo.length} potential tables on page ${
            pageIndex + 1
          }`
        );

        // 2. Extract content between consecutive table titles
        const tables = extractTablesByTitles(
          page.content,
          tableTitlesInfo,
          pageIndex
        );
        tables.forEach((table) => allTables.push(table));
      } else {
        // If no table titles found, try structure-based extraction
        console.log(
          `No table titles found, trying structure-based extraction on page ${
            pageIndex + 1
          }`
        );
        const structuralTables = extractTablesByStructure(
          page.content,
          pageIndex
        );
        structuralTables.forEach((table) => allTables.push(table));
      }
    });

    return allTables;
  } catch (error) {
    console.error("Error extracting tables:", error);
    throw error;
  }
}

// Function to find table titles in PDF content
function findTableTitles(pageContent) {
  const titlePattern = /^Table\s+\d+/i;
  const tableTitles = [];

  pageContent.forEach((item, index) => {
    if (titlePattern.test(item.str.trim())) {
      tableTitles.push({
        index: index,
        text: item.str.trim(),
        y: item.y,
        item: item,
      });
    }
  });

  // Sort by vertical position (top to bottom)
  return tableTitles.sort((a, b) => a.y - b.y);
}

// Extract tables based on identified table titles
function extractTablesByTitles(pageContent, tableTitlesInfo, pageIndex) {
  const tables = [];

  // Process each identified table title
  for (let i = 0; i < tableTitlesInfo.length; i++) {
    const currentTitle = tableTitlesInfo[i];
    const nextTitle = tableTitlesInfo[i + 1];

    // Determine table content range
    const startIndex = currentTitle.index + 1; // Skip the title itself
    const endIndex = nextTitle ? nextTitle.index : pageContent.length;

    // Extract table content
    const tableContent = pageContent.slice(startIndex, endIndex);

    // Skip if not enough content
    if (tableContent.length < 3) continue;

    // Sort table content by position (top to bottom, then left to right)
    const sortedContent = [...tableContent].sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      // If items are approximately on the same line (within 5 units)
      if (yDiff < 5) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    // Organize content into rows based on y-position
    const rows = {};
    sortedContent.forEach((item) => {
      // Round y-position to account for slight misalignments (within 5 units)
      const y = Math.round(item.y / 5) * 5;
      if (!rows[y]) rows[y] = [];
      rows[y].push(item);
    });

    // Sort rows by vertical position and sort items within each row by horizontal position
    const sortedYPositions = Object.keys(rows).sort(
      (a, b) => parseFloat(a) - parseFloat(b)
    );
    const tableRows = sortedYPositions.map((y) =>
      rows[y].sort((a, b) => a.x - b.x)
    );

    // Process table rows to structured data
    if (tableRows.length >= 2) {
      // At least a header row and a data row
      // Try to detect header row (usually the first row, or might have special formatting)
      const headerRow = tableRows[0];
      const headers = headerRow.map(
        (item) =>
          item.str.trim() ||
          `Column${tables.length + 1}_${headerRow.indexOf(item) + 1}`
      );

      // Process data rows
      const data = [];
      for (let rowIndex = 1; rowIndex < tableRows.length; rowIndex++) {
        const rowItems = tableRows[rowIndex];
        if (rowItems.length === 0) continue;

        // Create structured row data
        const rowData = {};
        rowItems.forEach((cell) => {
          // Find closest header by x-position
          let bestHeaderIndex = 0;
          let minDistance = Math.abs(cell.x - headerRow[0].x);

          for (let h = 1; h < headerRow.length; h++) {
            const distance = Math.abs(cell.x - headerRow[h].x);
            if (distance < minDistance) {
              minDistance = distance;
              bestHeaderIndex = h;
            }
          }

          // Use header text as key, or generate one if the header is empty
          const headerKey =
            headers[bestHeaderIndex] || `Column${bestHeaderIndex + 1}`;

          // Handle case where multiple cells might map to the same header
          if (rowData[headerKey]) {
            rowData[headerKey] += " " + cell.str.trim();
          } else {
            rowData[headerKey] = cell.str.trim();
          }
        });

        // Only add non-empty rows
        if (Object.keys(rowData).length > 0) {
          data.push(rowData);
        }
      }

      // Add the processed table
      tables.push({
        tableIndex: tables.length + 1,
        title: currentTitle.text,
        headers: headers,
        data: data,
        pageNumber: pageIndex + 1,
      });
    }
  }

  return tables;
}

// Extract tables based on structure when no titles are found
function extractTablesByStructure(pageContent, pageIndex) {
  const tables = [];

  // Sort content by position (top to bottom, then left to right)
  const sortedContent = [...pageContent].sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < 5) return a.x - b.x;
    return a.y - b.y;
  });

  // Group by y-position to identify rows
  const rows = {};
  sortedContent.forEach((item) => {
    const y = Math.round(item.y / 5) * 5;
    if (!rows[y]) rows[y] = [];
    rows[y].push(item);
  });

  // Sort rows by vertical position
  const sortedYPositions = Object.keys(rows).sort(
    (a, b) => parseFloat(a) - parseFloat(b)
  );

  // Identify table regions by looking for consecutive rows with similar structure
  let tableStart = -1;
  let minColumns = 2; // Minimum number of columns to consider it a table

  for (let i = 0; i < sortedYPositions.length; i++) {
    const rowItems = rows[sortedYPositions[i]];

    // Check if this could be a table row (has multiple columns)
    if (rowItems.length >= minColumns) {
      if (tableStart === -1) {
        tableStart = i;
      }
    } else if (tableStart !== -1) {
      // This row doesn't match table pattern, check if we have enough rows to form a table
      if (i - tableStart >= 3) {
        // At least 3 rows to consider it a table
        const tableRows = sortedYPositions
          .slice(tableStart, i)
          .map((y) => rows[y]);
        processStructuralTable(tableRows, tables, pageIndex);
      }
      tableStart = -1;
    }
  }

  // Check if we have a table at the end
  if (tableStart !== -1 && sortedYPositions.length - tableStart >= 3) {
    const tableRows = sortedYPositions.slice(tableStart).map((y) => rows[y]);
    processStructuralTable(tableRows, tables, pageIndex);
  }

  return tables;
}

// Process a structural table (without title)
function processStructuralTable(tableRows, tables, pageIndex) {
  // Use first row as header
  const headerRow = tableRows[0];
  const headers = headerRow.map(
    (item) =>
      item.str.trim() ||
      `Column${tables.length + 1}_${headerRow.indexOf(item) + 1}`
  );

  // Process data rows
  const data = [];
  for (let rowIndex = 1; rowIndex < tableRows.length; rowIndex++) {
    const rowItems = tableRows[rowIndex];
    const rowData = {};

    rowItems.forEach((cell) => {
      // Find closest header
      let bestHeaderIndex = 0;
      let minDistance = Number.MAX_VALUE;

      for (let h = 0; h < headerRow.length; h++) {
        const distance = Math.abs(cell.x - headerRow[h].x);
        if (distance < minDistance) {
          minDistance = distance;
          bestHeaderIndex = h;
        }
      }

      const headerKey =
        headers[bestHeaderIndex] || `Column${bestHeaderIndex + 1}`;

      if (rowData[headerKey]) {
        rowData[headerKey] += " " + cell.str.trim();
      } else {
        rowData[headerKey] = cell.str.trim();
      }
    });

    if (Object.keys(rowData).length > 0) {
      data.push(rowData);
    }
  }

  tables.push({
    tableIndex: tables.length + 1,
    title: `Structural Table ${tables.length + 1}`,
    headers: headers,
    data: data,
    pageNumber: pageIndex + 1,
  });
}

// Enhanced function to detect footnotes and associate them with tables
function processFootnotes(pageContent, tables) {
  // Look for footnote patterns (e.g., "(1) Some footnote text")
  const footnotePattern = /^\(\d+\)\s+/;
  const footnotes = {};

  pageContent.forEach((item) => {
    const text = item.str.trim();
    if (footnotePattern.test(text)) {
      const match = text.match(/^\((\d+)\)\s+(.*)/);
      if (match) {
        const footnoteNumber = match[1];
        const footnoteText = match[2];
        footnotes[footnoteNumber] = footnoteText;
      }
    }
  });

  // Associate footnotes with tables that reference them
  tables.forEach((table) => {
    table.footnotes = {};

    // Check for footnote references in data cells
    table.data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        const cellText = row[key];
        // Look for footnote markers like "data text 1" or "data text (1)"
        const footnoteMarkers = cellText.match(/\((\d+)\)|\s(\d+)$/g);
        if (footnoteMarkers) {
          footnoteMarkers.forEach((marker) => {
            const footnoteNumber = marker.replace(/[()]/g, "").trim();
            if (footnotes[footnoteNumber]) {
              if (!table.footnotes[footnoteNumber]) {
                table.footnotes[footnoteNumber] = footnotes[footnoteNumber];
              }
            }
          });
        }
      });
    });
  });
}

// Execute the extraction
extractTablesFromPDF(pdfPath)
  .then((tables) => {
    console.log(`Successfully extracted ${tables.length} tables`);

    // Write the tables to a JSON file
    fs.writeFileSync(
      "extracted-tables-improved.json",
      JSON.stringify(tables, null, 2)
    );

    console.log("Tables saved to extracted-tables-improved.json");
  })
  .catch((error) => {
    console.error("Failed to extract tables:", error);
  });
