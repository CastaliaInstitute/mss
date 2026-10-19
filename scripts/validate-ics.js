const fs = require('fs');
const path = require('path');

const ICS_PATH = path.join(__dirname, '..', 'public', 'MSS.ics');
const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');

function validateICS() {
  console.log('🔍 Validating ICS file and image references...\n');
  
  const errors = [];
  const warnings = [];
  
  // Check if ICS file exists
  if (!fs.existsSync(ICS_PATH)) {
    errors.push(`ICS file not found: ${ICS_PATH}`);
    return { errors, warnings };
  }
  
  // Get all available images
  const availableImages = new Set();
  if (fs.existsSync(IMAGES_DIR)) {
    fs.readdirSync(IMAGES_DIR)
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.svg'))
      .forEach(f => availableImages.add(f));
  } else {
    errors.push(`Images directory not found: ${IMAGES_DIR}`);
  }
  
  console.log(`📁 Found ${availableImages.size} images in ${IMAGES_DIR}\n`);
  
  // Read and parse ICS file
  const content = fs.readFileSync(ICS_PATH, 'utf8');
  // RFC 5545 folds long properties onto lines beginning with one space or
  // tab. Unfold before checking image paths, retaining physical source lines
  // so diagnostics still point to the original file.
  const lines = [];
  const lineNumbers = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
      lineNumbers.push(index + 1);
    }
  });
  
  let inEvent = false;
  let eventCount = 0;
  let currentEvent = {};
  let eventsWithImages = 0;
  let eventsWithoutImages = 0;
  let invalidImageRefs = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect event start - BEGIN:VEVENT or UID/DTSTAMP after END:VEVENT or header
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = { lineNumber: lineNumbers[i] };
      eventCount++;
    } else if ((trimmed.startsWith('UID:') || trimmed.startsWith('DTSTAMP:')) && !inEvent) {
      // Event starts with UID or DTSTAMP (for files without BEGIN:VEVENT)
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (prevLine === 'END:VEVENT' || prevLine.startsWith('X-WR-') || 
          (prevLine === '' && i > 0 && lines[i - 2] && lines[i - 2].trim().startsWith('X-WR-'))) {
        inEvent = true;
        currentEvent = { lineNumber: lineNumbers[i] };
        eventCount++;
      }
    } else if (trimmed === 'END:VEVENT' && inEvent) {
      if (!currentEvent.hasImage) {
        eventsWithoutImages++;
        if (currentEvent.description) {
          const firstLine = currentEvent.description.split('\\n')[0].trim();
          warnings.push(`Event at line ${currentEvent.lineNumber} has no image: "${firstLine.substring(0, 50)}..."`);
        }
      } else {
        eventsWithImages++;
        // Validate image exists
        const filename = currentEvent.imagePath.split('/').pop();
        if (!availableImages.has(filename)) {
          invalidImageRefs.push({
            line: currentEvent.lineNumber,
            filename: filename,
            event: currentEvent.description ? currentEvent.description.split('\\n')[0].trim().substring(0, 50) : 'Unknown'
          });
        }
      }
      inEvent = false;
      currentEvent = {};
    } else if (inEvent && trimmed.startsWith('DESCRIPTION:')) {
      currentEvent.description = trimmed.replace('DESCRIPTION:', '').trim();
    } else if (inEvent && trimmed.startsWith('X-IMAGE:')) {
      currentEvent.hasImage = true;
      currentEvent.imagePath = trimmed.replace('X-IMAGE:', '').trim();
    }
  }
  
  // Check for proper BEGIN/END pairing
  const beginCount = (content.match(/BEGIN:VEVENT/g) || []).length;
  const endCount = (content.match(/END:VEVENT/g) || []).length;
  
  // Require BEGIN:VEVENT markers for proper ICS format
  if (beginCount === 0 && eventCount > 0) {
    errors.push(`ICS file missing BEGIN:VEVENT markers. Run: npm run fix:ics-format or node scripts/fix-ics-format.js`);
  } else if (beginCount > 0 && beginCount !== endCount) {
    errors.push(`Mismatched BEGIN:VEVENT (${beginCount}) and END:VEVENT (${endCount}) markers`);
  }
  
  // Report invalid image references
  if (invalidImageRefs.length > 0) {
    errors.push(`\n❌ Found ${invalidImageRefs.length} invalid image references:`);
    invalidImageRefs.slice(0, 10).forEach(ref => {
      errors.push(`   Line ${ref.line}: ${ref.filename} (Event: "${ref.event}...")`);
    });
    if (invalidImageRefs.length > 10) {
      errors.push(`   ... and ${invalidImageRefs.length - 10} more`);
    }
  }
  
  // Summary
  console.log(`📊 Validation Summary:`);
  console.log(`   Total events: ${eventCount}`);
  console.log(`   Events with images: ${eventsWithImages}`);
  console.log(`   Events without images: ${eventsWithoutImages}`);
  console.log(`   Invalid image references: ${invalidImageRefs.length}\n`);
  
  if (errors.length > 0) {
    console.log(`❌ ERRORS (${errors.length}):`);
    errors.forEach(err => console.log(`   ${err}`));
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):`);
    warnings.slice(0, 10).forEach(warn => console.log(`   ${warn}`));
    if (warnings.length > 10) {
      console.log(`   ... and ${warnings.length - 10} more warnings`);
    }
    console.log('');
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All validations passed! ICS file is ready.\n');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalEvents: eventCount,
      eventsWithImages,
      eventsWithoutImages,
      invalidImageRefs: invalidImageRefs.length
    }
  };
}

if (require.main === module) {
  const result = validateICS();
  process.exit(result.valid ? 0 : 1);
}

module.exports = { validateICS };
