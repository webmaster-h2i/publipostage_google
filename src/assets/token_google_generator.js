// convert a pem Key into a CryptoKey object that can be use with the web crypto api sign
export function importRsaKey(pem) {
  // fetch the part of the PEM string between header and footer
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.substring(
    pemHeader.length,
    pem.length - pemFooter.length - 1
  );
  // base64 decode the string to get the binary data
  const binaryDerString = window.atob(pemContents);
  // convert from a binary string to an ArrayBuffer
  const binaryDer = str2ab(binaryDerString);

  return window.crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"]
  );
};

// convert String to ArrayBuffer
function str2ab(str){
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
};

// convert b64 string into bs64-url string
export function b64UrlEncoder(str){
  return window.btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
};

// convert byte array into b64-url string
export function b64UrlEncoderByte(byteArray){
    return window.btoa(
        Array.from(new Uint8Array(byteArray))
          .map((val) => {
            return String.fromCharCode(val);
          })
          .join("")
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/\=/g, "");
};
