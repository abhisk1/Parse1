const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');

// Load the PDF
async function extractTextFromPDF(pdfPath) {
  const loadingTask = pdfjsLib.getDocument(pdfPath);
  const pdf = await loadingTask.promise;

  let textContent = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    textContent += pageText + '\n';
  }

  return textContent;
}

// Example usage
extractTextFromPDF('./example.pdf')
  .then(text => {
    console.log('Extracted Text:\n', text);
    // Step 3 would be converting this to JSON
  })
  .catch(err => console.error('Error:', err));
