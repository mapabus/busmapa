import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cyrillic to Latin mapping
const cyrillicToLatin = {
  'а': 'a',
  'б': 'b',
  'в': 'v',
  'г': 'g',
  'д': 'd',
  'е': 'e',
  'ж': 'zh',
  'з': 'z',
  'и': 'i',
  'й': 'j',
  'к': 'k',
  'л': 'L',
  'м': 'm',
  'н': 'n',
  'о': 'o',
  'п': 'P',
  'р': 'r',
  'с': 's',
  'т': 't',
  'у': 'u',
  'ф': 'f',
  'х': 'h',
  'ц': 'c',
  'ч': 'ch',
  'ш': 'sh',
  'щ': 'shch',
  'ъ': '',
  'ы': 'y',
  'ь': '',
  'э': 'e',
  'ю': 'yu',
  'я': 'ya',
  'А': 'A',
  'Б': 'B',
  'В': 'V',
  'Г': 'G',
  'Д': 'D',
  'Е': 'E',
  'Ж': 'Zh',
  'З': 'Z',
  'И': 'I',
  'Й': 'J',
  'К': 'K',
  'Л': 'L',
  'М': 'M',
  'Н': 'N',
  'О': 'O',
  'П': 'P',
  'Р': 'R',
  'С': 'S',
  'Т': 'T',
  'У': 'U',
  'Ф': 'F',
  'Х': 'H',
  'Ц': 'C',
  'Ч': 'Ch',
  'Ш': 'Sh',
  'Щ': 'Shch',
  'Ъ': '',
  'Ы': 'Y',
  'Ь': '',
  'Э': 'E',
  'Ю': 'Yu',
  'Я': 'Ya',
};

// Special handling for specific patterns
const specialPatterns = {
  'мв': 'MV',
  'МВ': 'MV',
  'Мв': 'MV',
  'мВ': 'MV',
};

/**
 * Converts Cyrillic characters to their Latin equivalents
 * @param {string} text - Text containing Cyrillic characters
 * @returns {string} Text with Cyrillic characters converted to Latin
 */
function convertCyrillicToLatin(text) {
  // First check for special patterns
  let result = text;
  for (const [cyrillic, latin] of Object.entries(specialPatterns)) {
    result = result.replace(new RegExp(cyrillic, 'g'), latin);
  }
  
  // Then convert individual characters
  return result.split('').map(char => {
    return cyrillicToLatin[char] || char;
  }).join('');
}

/**
 * Parses the lista.txt HTML file to extract route mappings
 * @param {string} filePath - Path to the lista.txt file
 * @returns {Object} Object mapping route IDs to display names
 * 
 * The file contains HTML with route entries in this format:
 * - Line with URL: linija/{routeId}/prikaz
 * - Following lines contain the display name (possibly in Cyrillic)
 */
function parseListaFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const routeMapping = {};
  let currentRouteId = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for route ID in URL
    const routeIdMatch = line.match(/linija\/(\d+)\/prikaz/);
    if (routeIdMatch) {
      currentRouteId = routeIdMatch[1];
    }
    
    // Look for display name in the next few lines
    // Display names appear after the URL line, in a line that's mostly whitespace with the name
    if (currentRouteId && !routeMapping[currentRouteId]) {
      // Check the current and next few lines for the display name
      for (let j = 0; j < 5 && (i + j) < lines.length; j++) {
        const searchLine = lines[i + j];
        // Display name pattern: lots of whitespace, then the name, then more whitespace
        const displayNameMatch = searchLine.match(/^\s+([^\s[]+)\s*$/);
        if (displayNameMatch) {
          let displayName = displayNameMatch[1].trim();
          // Convert Cyrillic to Latin
          displayName = convertCyrillicToLatin(displayName);
          routeMapping[currentRouteId] = displayName;
          currentRouteId = null; // Reset to avoid duplicate entries
          break;
        }
      }
    }
  }
  
  return routeMapping;
}

function main() {
  const listaFilePath = path.join(__dirname, 'api', 'lista', 'lista.txt');
  const outputFilePath = path.join(__dirname, 'public', 'route-mapping.json');
  
  console.log('Reading lista.txt...');
  const routeMapping = parseListaFile(listaFilePath);
  
  console.log(`Found ${Object.keys(routeMapping).length} routes`);
  
  // Sort by route ID for better readability
  const sortedMapping = Object.keys(routeMapping)
    .sort((a, b) => {
      // Sort numerically
      return parseInt(a) - parseInt(b);
    })
    .reduce((acc, key) => {
      acc[key] = routeMapping[key];
      return acc;
    }, {});
  
  // Write to file
  fs.writeFileSync(outputFilePath, JSON.stringify(sortedMapping, null, 2), 'utf-8');
  console.log(`Route mapping saved to ${outputFilePath}`);
  
  // Show some examples
  console.log('\nFirst 10 mappings:');
  Object.entries(sortedMapping).slice(0, 10).forEach(([id, name]) => {
    console.log(`  ${id}: ${name}`);
  });
}

main();
