(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StylePandaTextTools = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var examples = {
    counter: 'StylePanda Tools verarbeitet Texte lokal im Browser.\n\nDieser Beispielsatz zeigt die Statistik. Texte bleiben dabei privat.',
    cleaner: '  Hallo,   Welt !  \n\n\n\tDiese Zeile enthält\tTabs.   \n  Und außen stehen Leerzeichen.  ',
    caseConverter: 'willkommen bei StylePanda tools! dies ist ein Beispiel für klare texte.',
    sorter: 'Banane\napfel\n12\n3\n  Birne\nApfel',
    duplicates: 'Apfel\nBanane\napfel\nBirne\nBanane\n\n',
    replace: 'Der Panda mag Bambus. Der kleine Panda findet Bambus besonders gut.'
  };

  function normalizeNewlines(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  }

  function splitLines(text) {
    var value = normalizeNewlines(text);
    return value === '' ? [] : value.split('\n');
  }

  function words(text) {
    return String(text == null ? '' : text).match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu) || [];
  }

  function humanDuration(wordCount, wordsPerMinute) {
    if (!wordCount) return '0 Min.';
    var seconds = Math.ceil((wordCount / wordsPerMinute) * 60);
    if (seconds < 60) return '< 1 Min.';
    var minutes = Math.ceil(seconds / 60);
    return minutes + (minutes === 1 ? ' Min.' : ' Min.');
  }

  function countText(text) {
    var value = String(text == null ? '' : text);
    var normalized = normalizeNewlines(value);
    var foundWords = words(value);
    var trimmed = value.trim();
    var terminalGroups = trimmed ? (trimmed.match(/[.!?]+(?=\s|$)/g) || []).length : 0;
    var hasUnfinishedSentence = trimmed && !/[.!?]+$/.test(trimmed);
    var paragraphs = normalized.trim()
      ? normalized.trim().split(/\n[\t ]*\n+/).filter(function (block) { return block.trim() !== ''; }).length
      : 0;
    return {
      words: foundWords.length,
      charactersWithSpaces: value.length,
      charactersWithoutSpaces: value.replace(/\s/gu, '').length,
      sentences: terminalGroups + (hasUnfinishedSentence ? 1 : 0),
      paragraphs: paragraphs,
      lines: value === '' ? 0 : normalized.split('\n').length,
      uniqueWords: new Set(foundWords.map(function (word) { return word.toLocaleLowerCase('de'); })).size,
      readingTime: humanDuration(foundWords.length, 200),
      speakingTime: humanDuration(foundWords.length, 130)
    };
  }

  function cleanText(text, options) {
    var settings = Object.assign({
      leadingSpaces: false,
      trailingSpaces: false,
      collapseSpaces: false,
      removeEmptyLines: false,
      collapseEmptyLines: true,
      tabsToSpaces: false,
      removeLineBreaks: false,
      normalizeLineBreaks: true,
      removeSpaceBeforePunctuation: false,
      trimText: true,
      tabWidth: 4
    }, options || {});
    var value = String(text == null ? '' : text);

    // Deterministic order: newlines, tabs, per-line whitespace, punctuation,
    // blank-line policy, newline removal, and finally whole-text trimming.
    if (settings.normalizeLineBreaks) value = normalizeNewlines(value);
    if (settings.tabsToSpaces) value = value.replace(/\t/g, ' '.repeat(Math.max(1, Number(settings.tabWidth) || 4)));
    if (settings.leadingSpaces) value = value.replace(/^[\t ]+/gm, '');
    if (settings.trailingSpaces) value = value.replace(/[\t ]+$/gm, '');
    if (settings.collapseSpaces) value = value.replace(/[ \u00a0]{2,}/g, ' ');
    if (settings.removeSpaceBeforePunctuation) value = value.replace(/[\t \u00a0]+([,.;:!?])/g, '$1');
    if (settings.removeEmptyLines) {
      value = value.split(/\r\n?|\n/).filter(function (line) { return line.trim() !== ''; }).join('\n');
    } else if (settings.collapseEmptyLines) {
      value = value.replace(/(?:\r\n?|\n)(?:[\t ]*(?:\r\n?|\n)){2,}/g, '\n\n');
    }
    if (settings.removeLineBreaks) value = value.replace(/[\t ]*(?:\r\n?|\n)[\t ]*/g, ' ');
    if (settings.trimText) value = value.trim();
    return value;
  }

  function capitalizeFirstLetter(value) {
    return value.replace(/\p{L}/u, function (letter) { return letter.toLocaleUpperCase('de'); });
  }

  function sentenceCase(text) {
    var lower = String(text == null ? '' : text).toLocaleLowerCase('de');
    var capitalizeNext = true;
    return Array.from(lower).map(function (character) {
      if (capitalizeNext && /\p{L}/u.test(character)) {
        capitalizeNext = false;
        return character.toLocaleUpperCase('de');
      }
      if (/[.!?]/.test(character)) capitalizeNext = true;
      return character;
    }).join('');
  }

  function titleCase(text) {
    return String(text == null ? '' : text).toLocaleLowerCase('de').replace(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu, function (word) {
      return capitalizeFirstLetter(word);
    });
  }

  function invertCase(text) {
    return Array.from(String(text == null ? '' : text)).map(function (character) {
      var lower = character.toLocaleLowerCase('de');
      var upper = character.toLocaleUpperCase('de');
      if (character === lower && character !== upper) return upper;
      if (character === upper && character !== lower) return lower;
      return character;
    }).join('');
  }

  function identifierWords(text) {
    var prepared = String(text == null ? '' : text)
      .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
      .replace(/([\p{Lu}])([\p{Lu}][\p{Ll}])/gu, '$1 $2');
    return prepared.match(/[\p{L}\p{N}]+/gu) || [];
  }

  function convertCase(text, mode) {
    var value = String(text == null ? '' : text);
    if (mode === 'lower') return value.toLocaleLowerCase('de');
    if (mode === 'upper') return value.toLocaleUpperCase('de');
    if (mode === 'sentence') return sentenceCase(value);
    if (mode === 'title') return titleCase(value);
    if (mode === 'invert') return invertCase(value);
    var tokens = identifierWords(value).map(function (token) { return token.toLocaleLowerCase('de'); });
    if (mode === 'camel') return tokens.map(function (token, index) { return index ? capitalizeFirstLetter(token) : token; }).join('');
    if (mode === 'pascal') return tokens.map(capitalizeFirstLetter).join('');
    if (mode === 'snake') return tokens.join('_');
    if (mode === 'kebab') return tokens.join('-');
    return value;
  }

  function compareText(a, b, options) {
    var left = options.trimCompare ? a.trim() : a;
    var right = options.trimCompare ? b.trim() : b;
    if (options.ignoreCase) {
      left = left.toLocaleLowerCase('de');
      right = right.toLocaleLowerCase('de');
    }
    return left.localeCompare(right, 'de', { sensitivity: options.ignoreCase ? 'base' : 'variant' });
  }

  function numericValue(line, trimCompare) {
    var candidate = trimCompare ? line.trim() : line;
    if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(candidate)) return null;
    var number = Number(candidate.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  function sortLines(text, mode, options, randomSource) {
    var settings = Object.assign({ ignoreEmpty: false, ignoreCase: true, trimCompare: true }, options || {});
    var lines = splitLines(text);
    if (settings.ignoreEmpty) lines = lines.filter(function (line) { return line.trim() !== ''; });
    if (mode === 'reverse') return lines.reverse().join('\n');
    if (mode === 'random') {
      var random = randomSource || Math.random;
      for (var index = lines.length - 1; index > 0; index -= 1) {
        var swapIndex = Math.floor(random() * (index + 1));
        var temporary = lines[index];
        lines[index] = lines[swapIndex];
        lines[swapIndex] = temporary;
      }
      return lines.join('\n');
    }
    var decorated = lines.map(function (line, index) { return { line: line, index: index }; });
    decorated.sort(function (a, b) {
      var result = 0;
      if (mode === 'az' || mode === 'za') result = compareText(a.line, b.line, settings) * (mode === 'za' ? -1 : 1);
      if (mode === 'shortest' || mode === 'longest') {
        var leftLength = (settings.trimCompare ? a.line.trim() : a.line).length;
        var rightLength = (settings.trimCompare ? b.line.trim() : b.line).length;
        result = (leftLength - rightLength) * (mode === 'longest' ? -1 : 1);
      }
      if (mode === 'numeric-asc' || mode === 'numeric-desc') {
        var leftNumber = numericValue(a.line, settings.trimCompare);
        var rightNumber = numericValue(b.line, settings.trimCompare);
        if (leftNumber === null && rightNumber !== null) result = 1;
        else if (leftNumber !== null && rightNumber === null) result = -1;
        else if (leftNumber !== null && rightNumber !== null) result = (leftNumber - rightNumber) * (mode === 'numeric-desc' ? -1 : 1);
      }
      return result || (a.index - b.index);
    });
    return decorated.map(function (entry) { return entry.line; }).join('\n');
  }

  function removeDuplicateLines(text, options) {
    var settings = Object.assign({ caseSensitive: false, whitespaceSensitive: false, removeEmpty: false }, options || {});
    var inputLines = splitLines(text);
    var seen = new Set();
    var kept = [];
    var removed = 0;
    inputLines.forEach(function (line) {
      if (settings.removeEmpty && line.trim() === '') {
        removed += 1;
        return;
      }
      var key = settings.whitespaceSensitive ? line : line.trim();
      if (!settings.caseSensitive) key = key.toLocaleLowerCase('de');
      if (seen.has(key)) removed += 1;
      else {
        seen.add(key);
        kept.push(line);
      }
    });
    return { text: kept.join('\n'), before: inputLines.length, after: kept.length, removed: removed };
  }

  function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findAndReplace(text, search, replacement, options) {
    var settings = Object.assign({ replaceAll: true, caseSensitive: false, wholeWord: false, regex: false }, options || {});
    var sourceText = String(text == null ? '' : text);
    var query = String(search == null ? '' : search);
    if (!query) return { text: sourceText, matches: 0, replacements: 0, error: 'Bitte gib einen Suchbegriff ein.' };
    var pattern = settings.regex ? query : escapeRegularExpression(query);
    if (settings.wholeWord) pattern = '(?<![\\p{L}\\p{N}_])(?:' + pattern + ')(?![\\p{L}\\p{N}_])';
    var baseFlags = (settings.caseSensitive ? '' : 'i') + 'u';
    try {
      var countingExpression = new RegExp(pattern, baseFlags + 'g');
      var matches = Array.from(sourceText.matchAll(countingExpression)).length;
      var replacingExpression = new RegExp(pattern, baseFlags + (settings.replaceAll ? 'g' : ''));
      return {
        text: sourceText.replace(replacingExpression, String(replacement == null ? '' : replacement)),
        matches: matches,
        replacements: settings.replaceAll ? matches : Math.min(matches, 1),
        error: ''
      };
    } catch (error) {
      return { text: sourceText, matches: 0, replacements: 0, error: 'Der reguläre Ausdruck ist ungültig. Bitte prüfe das Suchmuster.' };
    }
  }

  function setStatus(container, message, isError) {
    var status = container.querySelector('[data-status]');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  function copyText(value, container) {
    function success() { setStatus(container, 'In Zwischenablage kopiert.', false); }
    function failure() { setStatus(container, 'Kopieren war nicht möglich. Bitte markiere das Ergebnis manuell.', true); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(success, failure);
      return;
    }
    var helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.className = 'clipboard-helper';
    document.body.appendChild(helper);
    helper.select();
    try { document.execCommand('copy') ? success() : failure(); } catch (error) { failure(); }
    helper.remove();
  }

  function getOptions(container) {
    var options = {};
    container.querySelectorAll('[data-option]').forEach(function (control) {
      if (control.type === 'radio' && !control.checked) return;
      options[control.dataset.option] = control.type === 'checkbox' ? control.checked : control.value;
    });
    return options;
  }

  function resetTool(container, update) {
    var form = container.querySelector('form');
    if (form) form.reset();
    container.querySelectorAll('textarea, input[type="text"]').forEach(function (field) { field.value = ''; });
    setStatus(container, '', false);
    var error = container.querySelector('[data-error]');
    if (error) error.textContent = '';
    update();
    var input = container.querySelector('[data-input]');
    if (input) input.focus();
  }

  function wireCommon(container, example, update, exampleSetup) {
    var input = container.querySelector('[data-input]');
    var output = container.querySelector('[data-output]');
    var exampleButton = container.querySelector('[data-action="example"]');
    var resetButton = container.querySelector('[data-action="reset"]');
    var copyButton = container.querySelector('[data-action="copy"]');
    if (exampleButton) exampleButton.addEventListener('click', function () {
      input.value = example;
      if (exampleSetup) exampleSetup(container);
      update();
      input.focus();
    });
    if (resetButton) resetButton.addEventListener('click', function () { resetTool(container, update); });
    if (copyButton) copyButton.addEventListener('click', function () {
      if (!output || output.value === '') setStatus(container, 'Es gibt noch kein Ergebnis zum Kopieren.', true);
      else copyText(output.value, container);
    });
  }

  function wireCounter(container) {
    var input = container.querySelector('[data-input]');
    function update() {
      var stats = countText(input.value);
      Object.keys(stats).forEach(function (key) {
        var target = container.querySelector('[data-stat="' + key + '"]');
        if (target) target.textContent = String(stats[key]);
      });
    }
    input.addEventListener('input', update);
    wireCommon(container, examples.counter, update);
    update();
  }

  function wireActionTool(container, config) {
    var input = container.querySelector('[data-input]');
    var output = container.querySelector('[data-output]');
    var apply = container.querySelector('[data-action="apply"]');
    function clearResult() {
      output.value = '';
      setStatus(container, '', false);
      if (config.updateCounters) config.updateCounters(container, input.value, '');
    }
    function run(event) {
      if (event) event.preventDefault();
      var result = config.transform(container, input.value, getOptions(container));
      output.value = typeof result === 'string' ? result : result.text;
      if (config.after) config.after(container, result);
      setStatus(container, result.error || config.success, Boolean(result.error));
    }
    apply.addEventListener('click', run);
    input.addEventListener('input', function () {
      if (config.liveInput) config.liveInput(container, input.value);
    });
    wireCommon(container, config.example, clearResult, config.exampleSetup);
    clearResult();
  }

  function initialize(container) {
    var name = container.dataset.textTool;
    var form = container.querySelector('form');
    if (form) form.addEventListener('submit', function (event) { event.preventDefault(); });
    if (name === 'counter') return wireCounter(container);
    if (name === 'cleaner') return wireActionTool(container, {
      example: examples.cleaner,
      success: 'Text wurde bereinigt.',
      transform: function (element, text, options) { return cleanText(text, options); }
    });
    if (name === 'case') {
      var input = container.querySelector('[data-input]');
      var output = container.querySelector('[data-output]');
      function update() { output.value = ''; setStatus(container, '', false); }
      container.querySelectorAll('[data-conversion]').forEach(function (button) {
        button.addEventListener('click', function () {
          output.value = convertCase(input.value, button.dataset.conversion);
          setStatus(container, input.value ? 'Umwandlung angewendet.' : 'Die Eingabe ist leer.', !input.value);
        });
      });
      wireCommon(container, examples.caseConverter, update);
      update();
      return;
    }
    if (name === 'sorter') return wireActionTool(container, {
      example: examples.sorter,
      success: 'Sortierung angewendet.',
      transform: function (element, text, options) { return sortLines(text, options.mode, options); },
      updateCounters: function (element, before, after) {
        element.querySelector('[data-count="input"]').textContent = String(splitLines(before).length);
        element.querySelector('[data-count="output"]').textContent = String(splitLines(after).length);
      },
      after: function (element, result) {
        element.querySelector('[data-count="input"]').textContent = String(splitLines(inputValue(element)).length);
        element.querySelector('[data-count="output"]').textContent = String(splitLines(result.text || result).length);
      },
      liveInput: function (element, value) { element.querySelector('[data-count="input"]').textContent = String(splitLines(value).length); }
    });
    if (name === 'duplicates') return wireActionTool(container, {
      example: examples.duplicates,
      success: 'Doppelte Zeilen wurden entfernt.',
      transform: function (element, text, options) { return removeDuplicateLines(text, options); },
      after: function (element, result) {
        element.querySelector('[data-count="before"]').textContent = String(result.before);
        element.querySelector('[data-count="after"]').textContent = String(result.after);
        element.querySelector('[data-count="removed"]').textContent = String(result.removed);
      },
      updateCounters: function (element) {
        ['before', 'after', 'removed'].forEach(function (key) { element.querySelector('[data-count="' + key + '"]').textContent = '0'; });
      }
    });
    if (name === 'replace') return wireActionTool(container, {
      example: examples.replace,
      success: 'Suchen und Ersetzen abgeschlossen.',
      transform: function (element, text, options) {
        options.replaceAll = options.replaceMode === 'all';
        return findAndReplace(text, element.querySelector('[data-search]').value, element.querySelector('[data-replacement]').value, options);
      },
      exampleSetup: function (element) {
        element.querySelector('[data-search]').value = 'Panda';
        element.querySelector('[data-replacement]').value = 'Koala';
      },
      after: function (element, result) {
        element.querySelector('[data-error]').textContent = result.error;
        element.querySelector('[data-count="matches"]').textContent = String(result.matches);
        element.querySelector('[data-count="replacements"]').textContent = String(result.replacements);
      },
      updateCounters: function (element) {
        element.querySelector('[data-error]').textContent = '';
        element.querySelector('[data-count="matches"]').textContent = '0';
        element.querySelector('[data-count="replacements"]').textContent = '0';
      }
    });
  }

  function inputValue(container) {
    return container.querySelector('[data-input]').value;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('[data-text-tool]').forEach(initialize);
    });
  }

  return {
    normalizeNewlines: normalizeNewlines,
    splitLines: splitLines,
    countText: countText,
    cleanText: cleanText,
    sentenceCase: sentenceCase,
    titleCase: titleCase,
    invertCase: invertCase,
    identifierWords: identifierWords,
    convertCase: convertCase,
    sortLines: sortLines,
    removeDuplicateLines: removeDuplicateLines,
    findAndReplace: findAndReplace
  };
}));
