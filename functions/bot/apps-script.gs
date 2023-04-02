/** @OnlyCurrentDoc */
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
      const validRange = sheet.getName() === "products" && column < 10 && row > 1;
      const validCell = validRange && cell.getValue();
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
          SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Value >>${cell.getValue()}<< field not be greater than 90 ${cell.getValue().length} > 90`);
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
        const delCatalogs = [];
        cell.getValue().split("#").forEach((catalogName) => {
          let id = null;
          let name = catalogName.trim();
          const url = name.match(/(.+)\[(.+)\]$/);
          if (url) {
            name = url[1].trim();
            const partial = url[2].split(",");
            id = partial[0] ? partial[0].trim() : translit(name);
          } else {
            id = translit(name);
          }
          if (name.charAt(0) === "%") {
            if (id.charAt(0) === "%") {
              id = id.replace(/^%-*/, "");
            }
            delCatalogs.push({id, del: true});
          } else {
            delCatalogs.push({id, del: false});
          }
          const valid_fail = validate(id, 40);
          if (valid_fail) {
            SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: ${valid_fail}`);
            sheet.setActiveSelection(`A${row}:J${row}`);
          }
        });
        // cheack delete catalogs
        for (const [index, value] of delCatalogs.entries()) {
          if (value.del) {
            if (!checkNestedCat(index, delCatalogs)) {
              // alert error
              // throw new Error(Delete catalog problem ${value.id}, first delete nested cat!!!);
              SpreadsheetApp.getUi().alert(`Error in row ${row}, column ${column}: Delete catalog problem ${value.id}, first delete nested cat!!!`);
              sheet.setActiveSelection(`A${row}:J${row}`);
            }
          }
        }
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

// check nested catalogs
function checkNestedCat(indexId, delCatalogs) {
  for (const [index, value] of delCatalogs.entries()) {
    if (index > indexId) {
      if (!value.del) {
        return false;
      }
    }
  }
  return true;
}

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
  "ь": "",
  "г": "g",
  "и": "i",
  "ъ": "",
  "ы": "i",
  "э": "e",
  "ґ": "g",
  "е": "e",
  "і": "i",
  "'": "",
  "’": "",
  "ʼ": "",
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
};

function translit(word) {
  return word.toString().split("").map((letter) => {
    const lowLetter = letter.toLowerCase();
    return lowLetter in lettersRuUk ? lettersRuUk[lowLetter] : lowLetter;
  }).join("");
}
