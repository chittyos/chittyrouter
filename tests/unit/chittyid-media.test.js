import { describe, it, expect, beforeAll } from "vitest";
import {
  generateMediaChittyID,
  validateChittyID,
  getChittyIDType,
  parseMediaChittyID,
} from "../../src/utils/chittyid-generator.js";

describe("Media ChittyID Generation and Validation", () => {
  let testChittyIDs;

  beforeAll(() => {
    // Sample ChittyIDs from your migration
    testChittyIDs = [
      "CHITTY-GDRIVE-1757369100211-bbc79caff4616a18a3a36ed7fc449a31",
      "CHITTY-GDRIVE-1757381724693-6f1114f627494c3d3139cd1ca0b05646",
      "CHITTY-GDRIVE-1757375404599-62dfbb8b81a260c7cc31ea45db482227",
      "CHITTY-GDRIVE-1757382683278-5456a78676f14fb53d04d339d9fd2211",
    ];
  });

  describe("generateMediaChittyID", () => {
    it("should generate valid media ChittyID with GDRIVE source", async () => {
      const mediaData = {
        path: "/Users/nb/configured/chittyos/migration/media/gdrive/test.mov",
        source: "GDRIVE",
      };

      const chittyId = await generateMediaChittyID(mediaData);

      expect(chittyId).toMatch(/^CHITTY-GDRIVE-\d+-[a-f0-9]{32}$/);
      expect(chittyId.startsWith("CHITTY-GDRIVE-")).toBe(true);
    });

    it("should generate unique ChittyIDs for different files", async () => {
      const media1 = {
        path: "/path/to/file1.mov",
        source: "GDRIVE",
      };

      const media2 = {
        path: "/path/to/file2.mp4",
        source: "GDRIVE",
      };

      const chittyId1 = await generateMediaChittyID(media1);
      const chittyId2 = await generateMediaChittyID(media2);

      expect(chittyId1).not.toBe(chittyId2);
    });

    it("should use default MEDIA source if not provided", async () => {
      const mediaData = {
        path: "/path/to/file.mov",
      };

      const chittyId = await generateMediaChittyID(mediaData);

      expect(chittyId).toMatch(/^MOCK-MEDIA-\d+-[a-f0-9]{32}$/);
    });
  });

  describe("validateChittyID", () => {
    it("should validate existing migration ChittyIDs", () => {
      testChittyIDs.forEach((chittyId) => {
        expect(validateChittyID(chittyId)).toBe(true);
      });
    });

    it("should validate standard email ChittyIDs", () => {
      const emailChittyID = "CE-1234abcd-EMAIL-1757369100211";
      expect(validateChittyID(emailChittyID)).toBe(true);
    });

    it("should validate document ChittyIDs", () => {
      const docChittyID = "CD-5678efab-DOC-1757369100211";
      expect(validateChittyID(docChittyID)).toBe(true);
    });

    it("should reject invalid ChittyIDs", () => {
      const invalidIds = [
        "INVALID-FORMAT",
        "CHITTY-GDRIVE-notanumber-hash",
        "CHITTY-GDRIVE-1757369100211-tooshort",
        "CE-WRONG-EMAIL-123",
      ];

      invalidIds.forEach((id) => {
        expect(validateChittyID(id)).toBe(false);
      });
    });
  });

  describe("getChittyIDType", () => {
    it("should identify MEDIA type for migration ChittyIDs", () => {
      testChittyIDs.forEach((chittyId) => {
        expect(getChittyIDType(chittyId)).toBe("MEDIA");
      });
    });

    it("should identify correct types for all formats", () => {
      expect(getChittyIDType("CE-1234abcd-EMAIL-123")).toBe("EMAIL");
      expect(getChittyIDType("CD-1234abcd-DOC-123")).toBe("DOCUMENT");
      expect(getChittyIDType("CC-1234abcd-CASE-123")).toBe("CASE");
      expect(getChittyIDType("CP-1234abcd-PERSON-123")).toBe("PARTICIPANT");
      expect(getChittyIDType("CHITTY-GDRIVE-123-abc")).toBe("MEDIA");
      expect(getChittyIDType("UNKNOWN-FORMAT")).toBe("UNKNOWN");
    });
  });

  describe("parseMediaChittyID", () => {
    it("should parse media ChittyID components correctly", () => {
      const chittyId =
        "CHITTY-GDRIVE-1757369100211-bbc79caff4616a18a3a36ed7fc449a31";
      const parsed = parseMediaChittyID(chittyId);

      expect(parsed).not.toBeNull();
      expect(parsed.source).toBe("GDRIVE");
      expect(parsed.timestamp).toBe(1757369100211);
      expect(parsed.hash).toBe("bbc79caff4616a18a3a36ed7fc449a31");
      expect(parsed.date).toBeInstanceOf(Date);
      expect(parsed.date.getTime()).toBe(1757369100211);
    });

    it("should return null for invalid media ChittyIDs", () => {
      const invalidIds = [
        "CE-1234abcd-EMAIL-123",
        "CHITTY-GDRIVE-notanumber-hash",
        "INVALID-FORMAT",
      ];

      invalidIds.forEach((id) => {
        expect(parseMediaChittyID(id)).toBeNull();
      });
    });

    it("should parse all test migration ChittyIDs", () => {
      testChittyIDs.forEach((chittyId) => {
        const parsed = parseMediaChittyID(chittyId);
        expect(parsed).not.toBeNull();
        expect(parsed.source).toBe("GDRIVE");
        expect(parsed.timestamp).toBeGreaterThan(0);
        expect(parsed.hash).toHaveLength(32);
      });
    });
  });

  describe("Router Integration", () => {
    it("should handle media files in routing decisions", async () => {
      const mediaFiles = [
        {
          path: "/Users/nb/configured/chittyos/migration/personal/gdrive/test.MOV",
          source: "GDRIVE",
        },
        {
          path: "/Users/nb/configured/chittyos/migration/media/gdrive/video.mp4",
          source: "GDRIVE",
        },
        {
          path: "/Users/nb/configured/chittyos/migration/media/gdrive/recording.mov",
          source: "GDRIVE",
        },
      ];

      const chittyIds = await Promise.all(
        mediaFiles.map((media) => generateMediaChittyID(media)),
      );

      chittyIds.forEach((chittyId) => {
        expect(validateChittyID(chittyId)).toBe(true);
        expect(getChittyIDType(chittyId)).toBe("MEDIA");

        const parsed = parseMediaChittyID(chittyId);
        expect(parsed.source).toBe("GDRIVE");
      });
    });
  });
});
