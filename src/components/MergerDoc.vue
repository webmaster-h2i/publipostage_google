<script setup>
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { ref } from "vue";

const fileOffline = ref('');

const uploadLocalFile = () =>{
    const reader = new FileReader();
    reader.readAsBinaryString(fileOffline.value.files[0]);
    reader.onerror = function (evt) {
        console.log("error reading file", evt);       
    };
    reader.onload = function (evt) {
        const fileToZip = evt.target.result;
        const zipFile = new PizZip(fileToZip);
        const docOffline = new Docxtemplater(zipFile, {
            paragraphLoop: true,
            linebreaks: true,
        });
        docOffline.setData({
            first_name: "jean",
            last_name: "test",
            phone: "8888888888"
        })
        docOffline.render();
        const blob = docOffline.getZip().generate({
            type: "blob",
            mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",       
        });
        saveAs(blob, "tesst.docx");
    }
}

</script>
<template>
    <input ref="fileOffline" v-on:change="uploadLocalFile()" id="file" type="file"/>
</template>
