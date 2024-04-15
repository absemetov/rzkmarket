/** @OnlyCurrentDoc 26.03.2024*/
function onEdit(e){
  const range = e.range;
  // range.setNote('Last modified: ' + new Date());
  const sheet = range.getSheet();
  const timestamp = Math.floor(Date.now() / 1000);
  // loop range
  for(let i = 1; i <= range.getNumRows(); i++) {
    for(let j = 1; j <= range.getNumColumns(); j++) {
      const cell = range.getCell(i, j);
      const column = cell.getColumn();
      const row = cell.getRow();
      const validRange = /^products/.test(sheet.getName()) && column < 10 && row > 1;
      const validCell = validRange && cell.getValue();
      // service sheet update timestamp

      const validRangeService = /^service/.test(sheet.getName()) && column < 8 && row > 1;
      const validCellService = validRangeService && cell.getValue();
      if (validCellService) {
        sheet.getRange(row, 8).setValue(timestamp);
      }
      
      // validateGroup upd timestamp catalogs sheet
      if (/^catalogs/.test(sheet.getName()) && column < 2 && row > 1 && cell.getValue()) {
        validateGroup(cell, row, column, sheet);
        sheet.getRange(row, 2).setValue(timestamp);
      }
      
      // validate ID
      if (column === 2 && validCell) {
        const valid_fail = validate(cell.getValue(), 40);
        if (valid_fail) {
          SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: ${valid_fail}`);
          sheet.setActiveSelection(`A${row}:J${row}`);
        }
      }
      // validate NAME
      if (column === 3 && validCell) {
        if (cell.getValue().length > 90) {
          SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Value >>${cell.getValue()}<< field not be greater than  90 ${cell.getValue().length} > 90`);
          sheet.setActiveSelection(`A${row}:J${row}`);
        }
      }
      // replace dot to comma
      if ((column === 4 || column === 5) && validCell) {
        const value = cell.getValue().toString().replace(/\s/g, "");
        if (!cell.getFormula()) {
          cell.setValue(value.replace(".", ","))
        }
      }
      // validate GROUP
      if (column === 7 && validCell) {
        validateGroup(cell, row, column, sheet);
      }
      // validate TAGS
      if (column === 8 && validCell) {
        cell.getValue().split(",").forEach((tag) => {
          const name = tag.trim();
          // const id = translit(name);
          if (name.length > 40) {
            SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Value >>${name}<< field not be greater than ${name.length} > 40`);
            sheet.setActiveSelection(`A${row}:J${row}`);
          }
        });
      }
      // validate Brand
      if (column === 9 && validCell) {
        const brandFormat = cell.getValue().match(/^\s*([\wа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ\s-]*[\wа-яА-ЯіїєґІЇЄҐ])\s*\[?\s*(\w[\w.-]*\w\s*)?\]?\s*$/) || []
        if (!brandFormat.length) {
          SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Value >>${cell.getValue()}<< field format wrong use Brand name(min:2)[site.com?]`);
          sheet.setActiveSelection(`A${row}:J${row}`);
        }
        if (cell.getValue().length > 40) {
          SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Value >>${cell.getValue()}<< field not be greater than ${cell.getValue().length} > 40`);
          sheet.setActiveSelection(`A${row}:J${row}`);
        }
      }
      // upd timestamp
      if (validRange) {
        sheet.getRange(row, 10).setValue(timestamp);
      }
    }
  }
}

// validate group
function validateGroup(cell, row, column, sheet) {
  const catalogsArray = cell.getValue().split("#");
  if (catalogsArray.length > 7) {
    SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: The groupLength may not be greater than 7.`);
      sheet.setActiveSelection(`A${row}:J${row}`);
  }
  // const delCatalogs = [];
  catalogsArray.forEach((catalogName) => {
    const options = catalogName.match(/^\s*([\wа-яА-ЯіїєґІЇЄҐ][\wа-яА-ЯіїєґІЇЄҐ\s(),-]*[\wа-яА-ЯіїєґІЇЄҐ)])\s*\|?\s*([\wа-яА-Я][\wа-яА-Я\s(),-]*[\wа-яА-Я)])?\s*\[\s*([\w][\w-]*[\w])?\s*,\s*([\d]+\s*)\s*,?\s*(del)?\s*\]\s*$/);
    if (options) {
      const id = options[3] ? options[3] : translit(options[1]);
      const valid_fail = validate(id, 40);
      if (valid_fail) {
        SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: ${valid_fail}`);
        sheet.setActiveSelection(`A${row}:J${row}`);
      }
    } else {
      SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Error format Name | NameRu [id?, orderNumber, del?]`);
      sheet.setActiveSelection(`A${row}:J${row}`);
    }
  });
  // cheack delete catalogs
  // for (const [index, value] of delCatalogs.entries()) {
  //   if (value.del) {
  //     if (!checkNestedCat(index, delCatalogs)) {
  //       // alert error
  //       // throw new Error(Delete catalog problem ${value.id}, first delete nested cat!!!);
  //       SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Delete catalog problem ${value.id}, first delete nested cat!!!`);
  //       sheet.setActiveSelection(`A${row}:J${row}`);
  //     }
  //   }
  // }
}

// check nested catalogs
// function checkNestedCat(indexId, delCatalogs) {
//   for (const [index, value] of delCatalogs.entries()) {
//     if (index > indexId) {
//       if (!value.del) {
//         return false;
//       }
//     }
//   }
//   return true;
// }

// validate field
function validate(field, length) {
  if (!/^[a-zA-Z0-9_-]+$/.test(field)) {
    return `Value >>${field}<< use alpha_dash characters`;
  }
  if (field.length > length) {
    return `Value >>${field}<< field not be greater than ${field.length} > ${length}`;
  }
  return false;
}

// translit
const lettersRuUk = {
  "а": "a",
  "б": "b",
  "в": "v",
  "д": "d",
  "з": "z",
  "й": "y",
  "к": "k",
  "л": "l",
  "м": "m",
  "н": "n",
  "о": "o",
  "п": "p",
  "р": "r",
  "с": "s",
  "т": "t",
  "у": "u",
  "ф": "f",
  "г": "g",
  "и": "i",
  "ы": "i",
  "э": "e",
  "ґ": "g",
  "е": "e",
  "і": "i",
  "ё": "yo",
  "ж": "zh",
  "х": "kh",
  "ц": "ts",
  "ч": "ch",
  "ш": "sh",
  "щ": "shch",
  "ю": "yu",
  "я": "ya",
  "є": "ye",
  "ї": "yi",
  " ": "-",
  "-": "-",
};

function translit(word) {
  return word.toString().split("").map((letter) => {
    const lowLetter = letter.toLowerCase();
    return lowLetter in lettersRuUk ? lettersRuUk[lowLetter] : (/[a-z\d]/.test(lowLetter) ? lowLetter : "");
  }).join("");
}
