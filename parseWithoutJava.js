const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const pdfExtract = new PDFExtract();

const pdfPath = path.resolve('./pdfs/sample-tables.pdf');

// Function to extract tables based on text positioning
async function extractTablesWithPdfJs(pdfPath) {
  try {
    console.log(`Extracting tables from: ${pdfPath}`);
    
    const result = await pdfExtract.extract(pdfPath, {});
    const tables = [];
    
    // Process each page
    result.pages.forEach((page, pageIndex) => {
      console.log(`Processing page ${pageIndex + 1}`);
      
      // Group text elements by their vertical positions to identify rows
      const rows = {};
      page.content.forEach(item => {
        // Round y-position to account for slight misalignments
        const y = Math.round(item.y);
        if (!rows[y]) rows[y] = [];
        rows[y].push(item);
      });
      
      // Sort rows by vertical position
      const sortedYPositions = Object.keys(rows).sort((a, b) => parseFloat(a) - parseFloat(b));
      
      // Look for table patterns (3+ rows with similar column structure)
      let tableStart = -1;
      let tableColumns = [];
      
      for (let i = 0; i < sortedYPositions.length; i++) {
        const y = sortedYPositions[i];
        const rowItems = rows[y].sort((a, b) => a.x - b.x);
        
        // Check if this row could be a table row
        // (3+ elements with consistent horizontal spacing)
        if (rowItems.length >= 3) {
          // Detect column positions by calculating x-positions
          const columnPositions = rowItems.map(item => Math.round(item.x / 10) * 10);
          
          if (tableStart === -1) {
            // Start of potential table
            tableStart = i;
            tableColumns = columnPositions;
          } else {
            // Check if column structure is similar to continue the table
            const matchingColumns = columnPositions.filter(x => 
              tableColumns.some(col => Math.abs(x - col) < 20)
            ).length;
            
            // If less than 50% of columns match, consider it a different table
            if (matchingColumns / Math.max(columnPositions.length, tableColumns.length) < 0.5) {
              // Process the previous table
              if (i - tableStart >= 3) {
                // We have at least 3 rows, process as table
                const tableRows = sortedYPositions.slice(tableStart, i).map(y => 
                  rows[y].sort((a, b) => a.x - b.x)
                );
                
                tables.push(processTableRows(tableRows, pageIndex + 1));
              }
              
              // Start new potential table
              tableStart = i;
              tableColumns = columnPositions;
            }
          }
        } else if (tableStart !== -1 && i - tableStart >= 3) {
          // End of a table with at least 3 rows
          const tableRows = sortedYPositions.slice(tableStart, i).map(y => 
            rows[y].sort((a, b) => a.x - b.x)
          );
          
          tables.push(processTableRows(tableRows, pageIndex + 1));
          tableStart = -1;
        }
      }
      
      // Process any remaining table at the end of the page
      if (tableStart !== -1 && sortedYPositions.length - tableStart >= 3) {
        const tableRows = sortedYPositions.slice(tableStart).map(y => 
          rows[y].sort((a, b) => a.x - b.x)
        );
        
        tables.push(processTableRows(tableRows, pageIndex + 1));
      }
    });
    
    return tables;
  } catch (error) {
    console.error('Error extracting tables:', error);
    throw error;
  }
}

// Helper function to process rows into structured table
function processTableRows(tableRows, pageNum) {
  // First row as headers
  const headerItems = tableRows[0];
  const headers = headerItems.map(item => item.str.trim());
  
  // Process remaining rows as data
  const data = tableRows.slice(1).map(rowItems => {
    const rowObj = {};
    
    // Map each cell to closest header by x-position
    rowItems.forEach(cell => {
      // Find closest header
      let closestHeader = headers[0];
      let minDistance = Math.abs(cell.x - headerItems[0].x);
      
      for (let i = 1; i < headerItems.length; i++) {
        const distance = Math.abs(cell.x - headerItems[i].x);
        if (distance < minDistance) {
          minDistance = distance;
          closestHeader = headers[i];
        }
      }
      
      rowObj[closestHeader] = cell.str.trim();
    });
    
    return rowObj;
  });
  
  return {
    tableIndex: pageNum,
    title: `Table on page ${pageNum}`,
    headers: headers,
    data: data
  };
}

// Execute the extraction
extractTablesWithPdfJs(pdfPath)
  .then(tables => {
    console.log(`Successfully extracted ${tables.length} tables`);
    
    // Write the tables to a JSON file
    fs.writeFileSync('extracted-tables-pdfjs.json', JSON.stringify(tables, null, 2));
    
    console.log('Tables saved to extracted-tables-pdfjs.json');
  })
  .catch(error => {
    console.error('Failed to extract tables:', error);
  });