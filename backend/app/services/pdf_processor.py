"""PDF text extraction service using PyMuPDF."""

import re

import pymupdf  # PyMuPDF

# Control characters that Postgres TEXT/VARCHAR cannot store (NUL, etc.)
_ILLEGAL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


class PDFProcessor:
    """Service for extracting text and metadata from PDF files."""

    @staticmethod
    async def extract_text(pdf_bytes: bytes) -> dict:
        """
        Extract text from PDF bytes.

        Args:
            pdf_bytes: Raw bytes of the PDF file

        Returns:
            Dictionary with:
                - text: Extracted text from all pages
                - page_count: Number of pages in the PDF
                - status: 'success' or 'failed'
                - error: Error message if status is 'failed' (optional)

        Example:
            >>> result = await pdf_processor.extract_text(pdf_data)
            >>> if result['status'] == 'success':
            ...     print(f"Extracted {len(result['text'])} chars from {result['page_count']} pages")
        """
        try:
            # Open PDF from bytes
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

            # Extract text from each page
            text_pages = []
            for page_num in range(len(doc)):
                page = doc[page_num]
                text = page.get_text()
                text_pages.append(text)

            # Combine all pages with double newline separator
            full_text = "\n\n".join(text_pages)

            # Strip NUL bytes and other control chars that Postgres rejects
            full_text = _ILLEGAL_CHARS.sub("", full_text)

            page_count = len(doc)

            # Close the document
            doc.close()

            return {
                "text": full_text,
                "page_count": page_count,
                "status": "success",
            }
        except Exception as e:
            return {
                "text": "",
                "page_count": 0,
                "status": "failed",
                "error": str(e),
            }

    @staticmethod
    async def extract_metadata(pdf_bytes: bytes) -> dict:
        """
        Extract metadata from PDF.

        Args:
            pdf_bytes: Raw bytes of the PDF file

        Returns:
            Dictionary with PDF metadata (title, author, subject, etc.)
        """
        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            metadata = doc.metadata
            doc.close()

            return {
                "status": "success",
                "metadata": metadata,
            }
        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "metadata": {},
            }

    @staticmethod
    async def validate_pdf(pdf_bytes: bytes) -> bool:
        """
        Validate that the bytes represent a valid PDF file.

        Args:
            pdf_bytes: Raw bytes to validate

        Returns:
            True if valid PDF, False otherwise
        """
        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            is_valid = len(doc) > 0
            doc.close()
            return is_valid
        except Exception:
            return False


# Singleton instance
pdf_processor = PDFProcessor()
