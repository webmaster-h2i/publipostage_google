<script setup>
import { loadScript } from "vue-plugin-load-script";
import { onMounted, ref } from "vue";
import credentials from "../../agcoptest-884d96911228.json";

// Google parameters
const API_KEY = "AIzaSyBY9WkncUkBNR-y5SJ5Sp6PP3FJJVMIxV8";
const DISCOVERY_DRIVE =
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const DISCOVERY_DOC = "https://docs.googleapis.com/$discovery/rest?version=v1";
const SCOPES =
  "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";

const gapiInited = ref(false);
const gisInited = ref(false);
const tokenClient = ref("");
const file = ref(null);
const listDocs = ref([]);
const varMerge = ref([]);
const errors = ref("");
const loader = ref(false);
const access_token = ref("");

onMounted(() => {
  // Loading scripts google
  loadScript("https://apis.google.com/js/api.js").then(() => gapiLoaded());
  loadScript("https://accounts.google.com/gsi/client").then(() => gisLoaded());
});

// Initialize google api client
const gapiLoaded = () => {
  gapi.load("client", initializeGapiClient);
};

const initializeGapiClient = () => {
  gapi.client
    .init({
      apiKey: API_KEY,
      discoveryDocs: [DISCOVERY_DOC, DISCOVERY_DRIVE]
    })
    .then(() => {
      gapiInited.value = true;
      gapi.client.load("drive", "v3").then(() => console.log("drive loaded"));
      showDocs();
    });
};

// Generate access_token for api 
const gisLoaded = async () => {
  let date = Math.floor(new Date().getTime() / 1000.0);

  let claim = {};
  claim.aud = credentials.token_uri;
  claim.scope = SCOPES;
  claim.iss = credentials.client_email;
  claim.exp = date + 1000;
  claim.iat = date;
  claim = JSON.stringify(claim);

  let b64header = window.btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  let b64claim = window.btoa(claim);
  let sigData = new TextEncoder().encode(
    b64UrlEncoder(b64header) + "." + b64UrlEncoder(b64claim)
  );
  let token = "";

  await importRsaKey(credentials.private_key).then(async (response) => {
    await window.crypto.subtle
      .sign({ name: "RSASSA-PKCS1-v1_5" }, response, sigData)
      .then((response) => {
        let b64sig = b64UrlEncoderByte(response);
        token =
          b64UrlEncoder(b64header) +
          "." +
          b64UrlEncoder(b64claim) +
          "." +
          b64sig;
      });
  });

  const call = await fetch(
    "https://oauth2.googleapis.com/token?grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" +
      token,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  ).then(async (response) => {
    access_token.value = await response.json();
    gapi.auth.setToken({
      access_token: access_token.value.access_token
    });
  });

  console.log(access_token.value.access_token);
};

const str2ab = (str) => {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
};

const importRsaKey = (pem) => {
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
      hash: "SHA-256"
    },
    true,
    ["sign"]
  );
};

const b64UrlEncoder = (str) => {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/\=+$/, "");
};

const b64UrlEncoderByte = (byteArray) => {
  return btoa(
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

// Authentication method
const handleAuthClick = () => {
  tokenClient.value.callback = async (response) => {
    if (response.error !== undefined) {
      throw resp;
    }
    listDocs.value = [];
    checkFolder();
  };
  // Open authentication form
  if (gapi.client.getToken() === null) {
    tokenClient.value.requestAccessToken({ prompt: "select_account" });
  }
};

// Check if folder exist, if not create one
const checkFolder = () => {
  let folder;
  gapi.client.drive.files
    .list({
      q: 'name = "agcop"'
    })
    .then((response) => {
      folder = response.result.files;
      if (folder && folder.length > 0) {
        folder.map((val) => {
          localStorage.setItem("parent_folder", val.id);
          console.log("folder agcop exist");
          showDocs();
        });
      } else {
        createFolder();
      }
    });
};

// Create new folder method
const createFolder = () => {
  let request = gapi.client.request({
    path: "drive/v3/files",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + access_token.value.access_token
    },
    body: {
      name: "agcop",
      mimeType: "application/vnd.google-apps.folder"
    }
  });
  request.then((response) => {
    localStorage.setItem("parent_folder", response.id);
    console.log("folder is create");
  });
};

// Method to upload csv or docx file to google drive
const uploadFile = () => {
  // Show loader until the file is upload
  loader.value = true;

  const formData = new FormData();

  const parentFolder = localStorage.getItem("parent_folder");

  const mimeTypeFile = file.value.files[0].type;

  // Verify the type of file, only csv and docx accepted
  switch (mimeTypeFile) {
    case "application/vnd.ms-excel": {
      var mimeTypeGoogle = "vnd.google-apps.spreadsheet";
      break;
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      var mimeTypeGoogle = "application/vnd.google-apps.document";
      break;
    }
    default: {
      throw "type not accepted";
    }
  }

  const metafile = new Blob([file.value.files[0]], { type: mimeTypeFile });

  const metadata = {
    name: file.value.files[0].name,
    mimeType: mimeTypeGoogle,
    parents: [parentFolder]
  };

  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", metafile);

  fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: new Headers({
        Authorization: "Bearer " + access_token.value.access_token
      }),
      body: formData
    }
  )
    .then((response) => {
      return response.json();
    })
    .then((value) => {
      loader.value = false;
      showDocs();
      openDoc(value.id, mimeTypeFile);
    });
};

// Get list of documents in the folder
const showDocs = () => {
  loader.value = true;
  listDocs.value = [];
  gapi.client.drive.files
    .list({
      q: `parents in "${localStorage.getItem("parent_folder")}"`
    })
    .then((response) => {
      let docs = response.result.files;
      docs.map((val) => {
        listDocs.value.push(val);
      });
      loader.value = false;
    });
};

// Open the document
const openDoc = (id, fileType) => {
  const fileTypeUrl =
    fileType == "application/vnd.ms-excel" ? "spreadsheets" : "document";
  window
    .open(
      "https://docs.google.com/" + fileTypeUrl + "/d/" + id + "/edit",
      "_blank"
    )
    .focus();
};

// Get the data to merge
const mergeDoc = (docId, index) => {
  loader.value = true;
  const dataToMerge = JSON.parse(varMerge.value[index].value);
  Object.entries(dataToMerge).forEach(([key, dataBlock]) => {
    let request = [];
    Object.entries(dataBlock).forEach((data) => {
      request.push({
        replaceAllText: {
          containsText: {
            text: "{{" + data[0] + "}}",
            matchCase: true
          },
          replaceText: data[1]
        }
      });
    });
    merge(docId, request, key);
  });
  loader.value = false;
};

// Merge the data
const merge = (idDocTemplate, requests, fileName) => {
  gapi.client.drive.files
    .copy({
      fileId: idDocTemplate,
      name: fileName
    })
    .then((response) => {
      let idCopyTemplate = response.result.id;
      gapi.client.docs.documents
        .batchUpdate({
          documentId: idCopyTemplate,
          resource: {
            requests
          }
        })
        .then(() => {
          let fileUrl =
            "https://docs.google.com/document/d/" +
            idCopyTemplate +
            "/export?format=pdf&portrait=false&size=A4";
          window.open(fileUrl).focus();
        })
        .then(() => deleteDoc(idCopyTemplate));
    });
};

// Method to delete document
const deleteDoc = (idDoc) => {
  loader.value = true;
  gapi.client.drive.files
    .delete({
      fileId: idDoc
    })
    .then((response) => {
      if (response.result) {
        errors.value = response.result;
      } else {
        showDocs();
        console.log(" Document delete !");
      }
    });
  loader.value = false;
};
</script>

<template>
  <div id="loader" v-show="loader">
    <div class="loader"></div>
  </div>
  <section>
    <button
      v-show="gisInited"
      id="authorize_button"
      @click="handleAuthClick()"
      class="bigbutton"
    >
      Connexion
    </button>
    <label for="file">upload file</label>
    <input
      ref="file"
      v-on:change="uploadFile()"
      id="file"
      type="file"
      style="display: none"
    />
  </section>
  <section>
    <ul v-for="(doc, index) in listDocs">
      <h2>{{ doc }}</h2>
      <textarea
        rows="5"
        cols="40"
        :ref="
          (el) => {
            varMerge[index] = el;
          }
        "
      >
      </textarea
      ><br />
      <button class="smallbutton" @click="openDoc(doc.id, doc.mimeType)">
        open
      </button>
      <button class="smallbutton" @click="mergeDoc(doc.id, index)">
        merge
      </button>
      <button class="smallbutton" @click="deleteDoc(doc.id)">delete</button>
    </ul>
  </section>
  <!--<section>
          <iframe src="https://docs.google.com/document/d/1BYz7JUy3c5xOuOMbzZ5EmCUOpD9iu6F1MU9S0KEsVXs/edit" id="googleFrame"></iframe>
        </section>-->
</template>

<style scoped>
section,
#loader,
h2 {
  display: flex;
  justify-content: center;
  align-items: center;
}

#googleFrame {
  width: 1500px;
  height: 1000px;
}

.bigbutton {
  width: 300px;
  height: 50px;
  margin: 1em;
  background-color: #0f398d;
  font-size: 1.3em;
  border: 0px;
  border-radius: 10px;
  color: white;
}

.smallbutton {
  width: 100px;
  height: 30px;
  margin: 1em;
  background-color: #0f398d;
  font-size: 0.8em;
  border: 0px;
  border-radius: 10px;
  color: white;
}

label {
  width: 300px;
  height: 50px;
  margin: 1em;
  background-color: #0f398d;
  font-size: 1.3em;
  border: 0px;
  border-radius: 10px;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
}

.loader {
  border: 16px solid #f3f3f3;
  /* Light grey */
  border-top: 16px solid #3498db;
  /* Blue */
  border-radius: 50%;
  width: 120px;
  height: 120px;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

ul {
  list-style-type: none;
}
</style>
