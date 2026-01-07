# Document Classification Schema
## ChittyOS Document Management Architecture

### 1. File Type Hierarchy

```
CANONICAL_STORE/
├── ORIGINALS/                    # Source of truth - never modified
│   ├── {entity}/
│   │   ├── CORPORATE/            # Formation, operating agreements, resolutions
│   │   ├── FINANCIAL/            # Bank statements, tax returns
│   │   ├── LEGAL/                # Court filings, signed contracts
│   │   └── PROPERTY/             # Deeds, leases, insurance
│   └── {case_id}/
│       ├── COURT_FILINGS/        # Filed with court
│       ├── EVIDENCE/             # Exhibits, supporting documents
│       └── CORRESPONDENCE/       # Emails, letters
│
├── READABLE/                     # Machine-readable copies
│   ├── OCR/                      # Extracted text from scans
│   ├── PARSED/                   # Structured data extractions
│   └── EMBEDDINGS/               # Vector representations for search
│
├── DRAFTS/                       # Never finalized documents
│   ├── CONTEMPORANEOUS/          # Created at time of events
│   ├── SUPERSEDED/               # Replaced by newer versions
│   └── ABANDONED/                # Never sent or used
│
└── NAVIGATION/                   # Shortcuts/aliases only
    ├── BY_DATE/
    ├── BY_ENTITY/
    ├── BY_CASE/
    └── BY_TYPE/
```

### 2. Document Status Taxonomy

```yaml
document_status:
  - ORIGINAL_SIGNED         # Has signatures, legally binding
  - ORIGINAL_FILED          # Submitted to court/agency
  - ORIGINAL_RECEIVED       # Received from external party
  - ORIGINAL_GENERATED      # Created by us, authoritative
  - DRAFT_CONTEMPORANEOUS   # Created at time of events, not finalized
  - DRAFT_SUPERSEDED        # Replaced by later version
  - DRAFT_ABANDONED         # Never used
  - COPY_READABLE           # OCR/text extraction of original
  - COPY_REFERENCE          # For reference only, not authoritative

provenance:
  - HUMAN_CREATED
  - AI_ASSISTED             # Created with AI help - may have errors
  - AI_GENERATED            # Fully AI generated - requires verification
  - SCANNED
  - OCR_EXTRACTED
  - EXTERNAL_RECEIVED
  - COURT_DOWNLOADED
  - BANK_DOWNLOADED

confidence:
  - VERIFIED                # Manually reviewed and confirmed
  - UNVERIFIED              # Not yet reviewed
  - FLAGGED_ERRORS          # Known errors identified
  - DISPUTED                # Content accuracy contested

legal_status:
  - FILED_WITH_COURT
  - FILED_WITH_AGENCY
  - SIGNED_BINDING
  - DRAFT_PRIVILEGED        # Attorney-client privilege
  - WORK_PRODUCT            # Attorney work product
  - BUSINESS_RECORD
  - PERSONAL
```

### 3. Metadata Schema for Each Document

```json
{
  "file_id": "sha256_hash",
  "canonical_path": "/ORIGINALS/ARIBIA_LLC/LEGAL/2024-03-01_Operating_Agreement.pdf",
  "original_filename": "ARIBIA LLC Operating Agreement 2024 03 01.pdf",
  "document_type": "operating_agreement",
  "entity": "ARIBIA_LLC",
  "case_reference": null,
  "document_status": "ORIGINAL_SIGNED",
  "provenance": "HUMAN_CREATED",
  "confidence": "VERIFIED",
  "legal_status": "SIGNED_BINDING",
  "created_date": "2024-03-01",
  "ingested_date": "2025-01-07T02:30:00Z",
  "has_readable_copy": true,
  "readable_path": "/READABLE/OCR/aribia_llc_operating_agreement_2024.txt",
  "errors_noted": [],
  "superseded_by": null,
  "supersedes": "2022-08-01_Operating_Agreement.pdf",
  "navigation_aliases": [
    "/NAVIGATION/BY_ENTITY/ARIBIA_LLC/Operating_Agreement_Current.pdf",
    "/NAVIGATION/BY_TYPE/CORPORATE/ARIBIA_LLC_Operating.pdf"
  ],
  "extracted_metadata": {
    "parties": ["Nicholas Bianchi", "Sharon Jones"],
    "effective_date": "2024-03-01",
    "key_terms": ["membership", "capital contributions", "distributions"]
  }
}
```

### 4. Classification Rules

#### Entity Assignment
1. Check for explicit entity mentions in content (ARIBIA LLC, IT CAN BE LLC, etc.)
2. Check document type mappings (certain types belong to certain entities)
3. Check file path context
4. Use NLP entity extraction as fallback
5. Flag ambiguous documents for manual review

#### Document Type Detection
1. Structural analysis (legal document patterns, financial statement patterns)
2. Header/footer extraction
3. Key phrase detection
4. Form recognition (court forms, tax forms)
5. NLP classification using trained model

#### Version Detection
1. Check for explicit version markers
2. Compare content hashes against known documents
3. Date analysis within document
4. Filename pattern analysis
5. Flag potential duplicates for review

### 5. Draft Handling Policy

**Preserve ALL drafts that may have evidentiary value:**
- Contemporaneous drafts show state of mind at time of creation
- Even erroneous drafts may demonstrate good faith efforts
- Superseded versions show evolution of positions

**Drafts that should be flagged:**
- AI-generated content (may have hallucinations)
- Documents with known errors
- Documents created after-the-fact attempting to document earlier events

**Draft metadata must include:**
- Why it was never finalized
- What (if anything) superseded it
- Whether errors were identified
- Whether it has been disclosed in litigation

### 6. Error Acknowledgment

Every document, including court-filed ones, may contain:
- Factual errors
- Calculation mistakes
- AI-generated hallucinations
- Misstatements (intentional or unintentional)
- OCR extraction errors

**Policy:**
- Never assume court-filed = accurate
- Track known errors in metadata
- Cross-reference claims against verified sources
- Flag contradictions between documents
