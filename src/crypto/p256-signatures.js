/**
 * P256 Cryptographic Signatures for ChittyID
 * Implements ECDSA with P-256 curve for secure ChittyID operations
 */

/**
 * P256 Signature Manager for ChittyID operations
 */
export class ChittyP256Signatures {
  constructor(env) {
    this.env = env;
    this.keyPair = null;
    this.initialized = false;
  }

  /**
   * Initialize P256 key pair
   */
  async initialize() {
    try {
      // Generate or load P256 key pair
      this.keyPair = await this.getOrGenerateKeyPair();
      this.initialized = true;

      console.log('🔐 P256 signatures initialized');
      return { initialized: true };
    } catch (error) {
      console.error('❌ Failed to initialize P256 signatures:', error);
      throw error;
    }
  }

  /**
   * Get existing key pair or generate new one
   */
  async getOrGenerateKeyPair() {
    // Check if we have stored key pair
    const storedKeyPair = await this.getStoredKeyPair();

    if (storedKeyPair) {
      console.log('🔑 Using stored P256 key pair');
      return storedKeyPair;
    }

    // Generate new key pair
    console.log('🔑 Generating new P256 key pair');
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Store the key pair
    await this.storeKeyPair(keyPair);

    return keyPair;
  }

  /**
   * Get stored key pair from environment/storage
   */
  async getStoredKeyPair() {
    try {
      // Try to get from KV storage first
      if (this.env.CHITTYID_STORE) {
        const stored = await this.env.CHITTYID_STORE.get('p256-keypair');
        if (stored) {
          const keyData = JSON.parse(stored);

          // Import the keys
          const privateKey = await crypto.subtle.importKey(
            'jwk',
            keyData.privateKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
          );

          const publicKey = await crypto.subtle.importKey(
            'jwk',
            keyData.publicKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
          );

          return { privateKey, publicKey };
        }
      }

      // Try environment variables as fallback
      if (this.env.P256_PRIVATE_KEY && this.env.P256_PUBLIC_KEY) {
        const privateKeyData = JSON.parse(this.env.P256_PRIVATE_KEY);
        const publicKeyData = JSON.parse(this.env.P256_PUBLIC_KEY);

        const privateKey = await crypto.subtle.importKey(
          'jwk',
          privateKeyData,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign']
        );

        const publicKey = await crypto.subtle.importKey(
          'jwk',
          publicKeyData,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );

        return { privateKey, publicKey };
      }

      return null;
    } catch (error) {
      console.error('Failed to load stored key pair:', error);
      return null;
    }
  }

  /**
   * Store key pair securely
   */
  async storeKeyPair(keyPair) {
    try {
      // Export keys to JWK format
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

      const keyData = {
        privateKey: privateKeyJwk,
        publicKey: publicKeyJwk,
        algorithm: 'ECDSA',
        curve: 'P-256',
        created: new Date().toISOString()
      };

      // Store in KV if available
      if (this.env.CHITTYID_STORE) {
        await this.env.CHITTYID_STORE.put(
          'p256-keypair',
          JSON.stringify(keyData),
          { expirationTtl: 86400 * 365 * 2 } // 2 years
        );
        console.log('🔐 P256 key pair stored in KV');
      }

      // Also log public key for registration (never log private key)
      console.log('🔑 P256 Public Key (for ChittyID registration):', JSON.stringify(publicKeyJwk));

    } catch (error) {
      console.error('Failed to store key pair:', error);
      throw error;
    }
  }

  /**
   * Sign ChittyID request data
   */
  async signChittyIdRequest(requestData) {
    if (!this.initialized) {
      throw new Error('P256 signatures not initialized');
    }

    try {
      // Create canonical request string
      const canonicalRequest = this.createCanonicalRequest(requestData);

      // Convert to ArrayBuffer
      const data = new TextEncoder().encode(canonicalRequest);

      // Sign with private key
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.keyPair.privateKey,
        data
      );

      // Convert to base64
      const signatureBase64 = this.arrayBufferToBase64(signature);

      console.log('✍️ ChittyID request signed');

      return {
        signature: signatureBase64,
        algorithm: 'ECDSA-P256-SHA256',
        publicKey: await this.getPublicKeyJwk(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to sign ChittyID request:', error);
      throw error;
    }
  }

  /**
   * Sign ChittyID verification data
   */
  async signChittyIdVerification(chittyId, verificationData) {
    if (!this.initialized) {
      throw new Error('P256 signatures not initialized');
    }

    try {
      const signaturePayload = {
        chittyId,
        ...verificationData,
        timestamp: new Date().toISOString()
      };

      const canonicalData = this.createCanonicalRequest(signaturePayload);
      const data = new TextEncoder().encode(canonicalData);

      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.keyPair.privateKey,
        data
      );

      const signatureBase64 = this.arrayBufferToBase64(signature);

      console.log(`✍️ ChittyID verification signed for: ${chittyId}`);

      return {
        chittyId,
        signature: signatureBase64,
        algorithm: 'ECDSA-P256-SHA256',
        publicKey: await this.getPublicKeyJwk(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to sign ChittyID verification:', error);
      throw error;
    }
  }

  /**
   * Verify signature (for incoming requests)
   */
  async verifySignature(data, signature, publicKeyJwk) {
    try {
      // Import public key
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      // Create canonical request
      const canonicalData = this.createCanonicalRequest(data);
      const dataBuffer = new TextEncoder().encode(canonicalData);

      // Convert signature from base64
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      // Verify signature
      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        signatureBuffer,
        dataBuffer
      );

      console.log('🔍 Signature verification:', isValid ? 'VALID' : 'INVALID');

      return {
        valid: isValid,
        algorithm: 'ECDSA-P256-SHA256',
        verifiedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Failed to verify signature:', error);
      return {
        valid: false,
        error: error.message,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Create canonical request string for consistent signing
   */
  createCanonicalRequest(data) {
    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(data).sort();

    const canonicalPairs = sortedKeys.map(key => {
      const value = data[key];
      const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `${key}=${serializedValue}`;
    });

    return canonicalPairs.join('&');
  }

  /**
   * Get public key in JWK format
   */
  async getPublicKeyJwk() {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    return await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
  }

  /**
   * Get public key fingerprint for identification
   */
  async getPublicKeyFingerprint() {
    const publicKeyJwk = await this.getPublicKeyJwk();
    const keyString = JSON.stringify(publicKeyJwk);
    const keyBuffer = new TextEncoder().encode(keyString);

    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    const hashBase64 = this.arrayBufferToBase64(hashBuffer);

    // Take first 16 characters for fingerprint
    return hashBase64.substring(0, 16);
  }

  /**
   * Create signed ChittyID request headers
   */
  async createSignedHeaders(requestData) {
    const signatureData = await this.signChittyIdRequest(requestData);

    return {
      'X-ChittyID-Signature': signatureData.signature,
      'X-ChittyID-Algorithm': signatureData.algorithm,
      'X-ChittyID-Public-Key': JSON.stringify(signatureData.publicKey),
      'X-ChittyID-Timestamp': signatureData.timestamp
    };
  }

  /**
   * ArrayBuffer to Base64 conversion
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64 to ArrayBuffer conversion
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Get signature status and info
   */
  getSignatureInfo() {
    return {
      initialized: this.initialized,
      algorithm: 'ECDSA-P256-SHA256',
      curve: 'P-256',
      hashAlgorithm: 'SHA-256',
      keyPairGenerated: !!this.keyPair,
      publicKeyFingerprint: this.initialized ? this.getPublicKeyFingerprint() : null
    };
  }
}

/**
 * Enhanced ChittyID client with P256 signatures
 */
export class SignedChittyIdClient {
  constructor(env) {
    this.env = env;
    this.signatures = new ChittyP256Signatures(env);
  }

  /**
   * Initialize signed ChittyID client
   */
  async initialize() {
    await this.signatures.initialize();
    console.log('🔐 Signed ChittyID client initialized');
  }

  /**
   * Request ChittyID with P256 signature
   */
  async requestSignedChittyId(workerName, metadata = {}) {
    try {
      const requestData = {
        for: `chittyrouter-${workerName}`,
        region: metadata.region || '1',
        jurisdiction: metadata.jurisdiction || 'USA',
        entityType: 'T',
        trustLevel: metadata.trustLevel || '2',
        purpose: `ChittyOS Worker: ${workerName}`,
        requester: 'chittyrouter',
        timestamp: new Date().toISOString()
      };

      // Create signed headers
      const signedHeaders = await this.signatures.createSignedHeaders(requestData);

      const params = new URLSearchParams(requestData);

      const response = await fetch(`https://id.chitty.cc/api/v1/get-chittyid?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Service-Name': 'chittyrouter',
          'X-Worker-Name': workerName,
          'User-Agent': 'ChittyRouter/2.0.0-ai',
          ...signedHeaders
        }
      });

      if (!response.ok) {
        throw new Error(`Signed ChittyID request failed: ${response.status}`);
      }

      const result = await response.json();

      console.log(`🔐 Signed ChittyID received for ${workerName}: ${result.chittyId}`);

      return {
        chittyId: result.chittyId,
        metadata: result.metadata || {},
        timestamp: result.timestamp,
        signed: true,
        signature: signedHeaders['X-ChittyID-Signature']
      };

    } catch (error) {
      console.error(`Failed to request signed ChittyID for ${workerName}:`, error);
      throw error;
    }
  }

  /**
   * Verify ChittyID with signature
   */
  async verifySignedChittyId(chittyId) {
    try {
      const verificationData = {
        id: chittyId,
        context: 'worker-verification',
        timestamp: new Date().toISOString()
      };

      const signatureData = await this.signatures.signChittyIdVerification(chittyId, verificationData);

      const response = await fetch('https://id.chitty.cc/api/v1/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-ChittyID-Signature': signatureData.signature,
          'X-ChittyID-Algorithm': signatureData.algorithm,
          'X-ChittyID-Public-Key': JSON.stringify(signatureData.publicKey),
          'X-ChittyID-Timestamp': signatureData.timestamp
        },
        body: JSON.stringify(verificationData)
      });

      if (!response.ok) {
        return { valid: false, error: `Signed verification failed: ${response.status}` };
      }

      const result = await response.json();

      return {
        valid: result.valid,
        chittyId: result.id,
        details: result.details || {},
        signed: true,
        signature: signatureData.signature,
        lastVerified: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Failed to verify signed ChittyID ${chittyId}:`, error);
      return { valid: false, error: error.message };
    }
  }
}

/**
 * Export P256 signature utilities
 */
export const P256Utils = {
  generateKeyPair: async () => {
    return await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
  },

  exportPublicKey: async (keyPair) => {
    return await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  },

  createFingerprint: async (publicKeyJwk) => {
    const keyString = JSON.stringify(publicKeyJwk);
    const keyBuffer = new TextEncoder().encode(keyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
};