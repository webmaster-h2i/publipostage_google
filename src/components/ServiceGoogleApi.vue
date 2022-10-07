<script setup>
import { loadScript } from "vue-plugin-load-script";
import { onMounted, ref } from "vue";
import credentials from "../../agcoptest-884d96911228.json";
import * as tgg from "../assets/token_google_generator";

// Google parameters
const API_KEY = "AIzaSyBY9WkncUkBNR-y5SJ5Sp6PP3FJJVMIxV8";
const DISCOVERY_DRIVE = "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest";
const DISCOVERY_DOC = "https://docs.googleapis.com/$discovery/rest?version=v1";
const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents";

const file = ref(null);
const listDocs = ref([]);
const varMerge = ref([]);
const errors = ref("");
const loader = ref(false);
const access_token = ref("");

onMounted(() => {
  // load google api script
  loadScript("https://apis.google.com/js/api.js").then(() => gapiLoaded());
  // create an access token for google api
  loadScript("https://accounts.google.com/gsi/client").then(() => gauthLoaded());
});

// initialize google api client
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
      gapi.client.load("drive", "v3").then(() => console.log("drive loaded"));
      checkFolder();
      showDocs();
    });
};

// generate access_token
const gauthLoaded = async () => {

  let jwt = "";
  // create header of jwt in base64-url
  let header = tgg.b64UrlEncoder(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // get date in seconds
  let date = Math.floor(new Date().getTime() / 1000.0);
  // create payload of jwt in base64-url
  let claim = {};
  claim.aud = credentials.token_uri;
  claim.scope = SCOPES;
  claim.iss = credentials.client_email;
  claim.exp = date + 1000;
  claim.iat = date;
  claim = tgg.b64UrlEncoder(JSON.stringify(claim));
  // create a array of byte with data sign
  let sigData = new TextEncoder().encode(
    header + "." + claim
  );

  // create a cryptoKey with the pem and sign the jwt
  await tgg.importRsaKey(credentials.private_key).then(async (response) => {
    await window.crypto.subtle
      .sign({ name: "RSASSA-PKCS1-v1_5" }, response, sigData)
      .then((response) => {
        // convert sign to b64-url
        let b64sig = tgg.b64UrlEncoderByte(response);
        // format the token
        jwt = header +"."+claim +"."+b64sig;
      });
  });

  // request access_token to google api with the jwt
  await fetch(
    "https://oauth2.googleapis.com/token?grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" +
      jwt,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  ).then(async (response) => {
    access_token.value = await response.json();
    // set access_token 
    gapi.auth.setToken({
      access_token: access_token.value.access_token
    });
  });
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
  errors.value = "";

  const formData = new FormData();

  const parentFolder = localStorage.getItem("parent_folder");

  const mimeTypeFile = file.value.files[0].type;

  if(file.value.files[0].size > 1000000){
    errors.value = "Ce fichier est trop volumineux, la taille maximal autorisé est de 1 mo";
    loader.value = false;
    return;
  }

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
  <div id="loader" v-if="errors !== ''">
    <div><h3>{{errors}}</h3></div>
  </div>
  <section>
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
      <textarea rows="5" cols="40" :ref="(el) => {varMerge[index] = el}">
      </textarea><br/>
      <button class="smallbutton" @click="openDoc(doc.id, doc.mimeType)">
        open
      </button>
      <button class="smallbutton" @click="mergeDoc(doc.id, index)">
        merge
      </button>
      <button class="smallbutton" @click="deleteDoc(doc.id)">delete</button>
      <section>
          <iframe :src="'https://docs.google.com/document/d/'+doc.id+'/edit'" id="googleFrame"></iframe>
      </section>
    </ul>
  </section>
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
  width: 500px;
  height: 300px;
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
