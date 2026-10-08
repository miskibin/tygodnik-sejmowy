"""Blank source pages visually inspected on 2026-10-08, bound to exact PDF bytes.

This only records absence of text on these pages. It does not verify OCR on
other pages, article boundaries, legal applicability or amendment coverage.
Both PDFs have blank reverse sides at pages 2 and 4, checked at full page size.
"""

VISUALLY_INSPECTED_BLANK_PAGES = {
    # https://api.sejm.gov.pl/eli/acts/DU/1952/232/text/O/D19520232.pdf
    "d0e1e0913e7bc886439db234562d4a167af37f22f3eb1e4d45bd5b554fb36804": frozenset({2, 4}),
    # https://api.sejm.gov.pl/eli/acts/DU/1976/36/text/O/D19760036.pdf
    "637f767b43b79e43c39f7f8f9a94b00ca006a5b924450890ee6d3ae580d99c34": frozenset({2, 4}),
}
