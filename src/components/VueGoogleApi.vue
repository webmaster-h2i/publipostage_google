<script setup>
import { loadScript } from "vue-plugin-load-script";
import { onMounted, ref } from "vue";

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
const tokenApi = ref("");
const file = ref(null);
const listDocs = ref([]);
const varMerge = ref([]);

onMounted(() => {
  document.getElementById("authorize_button").style.visibility = "hidden";
  document.getElementById("signout_button").style.visibility = "hidden";
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
      maybeEnableButtons();
    });
};

// Initialize google Oauth2
const gisLoaded = () => {
  tokenClient.value = google.accounts.oauth2.initTokenClient({
    client_id:
      "625476714059-aoq8t870qq0u0lc1a4ejpd0fjehtre4t.apps.googleusercontent.com",
    scope: SCOPES,
    callback: "",
    login_hint: "agcoptest@gmail.com"
  });
  gisInited.value = true;
  maybeEnableButtons();
};

// Show button if google scripts are initialize
const maybeEnableButtons = () => {
  if (gapiInited.value && gisInited.value) {
    document.getElementById("authorize_button").style.visibility = "visible";
  }
};

// Authentication method
const handleAuthClick = () => {
  tokenClient.value.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw resp;
    }
    document.getElementById("signout_button").style.visibility = "visible";
    document.getElementById("authorize_button").innerText = "Refresh";
    listDocs.value = [];
    checkFolder();
  };
  // Open authentication form
  if (gapi.client.getToken() === null) {
    tokenClient.value.requestAccessToken({ prompt: "select_account" });
  }
};

// Logout method
const handleSignoutClick = () => {
  tokenApi.value = gapi.client.getToken();
  if (tokenApi.value !== null) {
    google.accounts.oauth2.revoke(tokenApi.value.access_token);
    gapi.client.setToken("");
    document.getElementById("content").innerText = "";
    document.getElementById("authorize_button").innerText = "Connexion";
    document.getElementById("signout_button").style.visibility = "hidden";
    listDocs.value = [];
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
  let accessToken = gapi.auth.getToken().access_token;
  let request = gapi.client.request({
    path: "drive/v3/files",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken
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
  // Verify if client is connect
  if (gapi.client.getToken() === null) {
    handleAuthClick();
  } else {
    // Show loader until the file is upload
    document.getElementById("loader").style.visibility = "visible";

    const formData = new FormData();

    const accessToken = gapi.auth.getToken().access_token;

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
        headers: new Headers({ Authorization: "Bearer " + accessToken }),
        body: formData
      }
    )
      .then((response) => {
        return response.json();
      })
      .then((value) => {
        document.getElementById("loader").style.visibility = "hidden";
        showDocs();
        openDoc(value.id, mimeTypeFile);
      });
  }
};

// Get the lits of documents in the folder
const showDocs = () => {
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
    merge(docId, request);
  });
};

// Merge the data
const merge = (docId, requests) => {
  /*gapi.client.drive.files.copy({
          'fileId': docId
        }).then((resp) =>{
          console.log(resp);
        })*/
  console.log(docId);
  console.log(requests);
  gapi.client.docs.documents
    .batchUpdate({
      documentId: docId,
      resource: {
        requests
      }
    })
    .then(() => {
      let fileUrl =
        "https://docs.google.com/document/d/" +
        docId +
        "/export?format=pdf&portrait=false&size=A4";
      window.open(fileUrl).focus();
    });
};
</script>

<template>
  <div id="loader">
    <div class="loader"></div>
  </div>
  <section>
    <button id="authorize_button" @click="handleAuthClick()" class="bigbutton">
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
    <button id="signout_button" class="bigbutton" @click="handleSignoutClick()">
      Sign Out
    </button>
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

#loader {
  visibility: hidden;
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
