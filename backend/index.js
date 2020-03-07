// Copyright 2017 Google Inc.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const config = require('./local.json');
const Storage = require('@google-cloud/storage');
const storage = new Storage({
    projectId: config.cloud_project_id
});

const client = new video.VideoIntelligenceServiceClient({
    projectId: config.cloud_project_id,
    keyfileName: './keyfile.json'
});

const ffmpeg = require('fluent-ffmpeg');
// const path = require('path');
// const binPath = path.resolve(__dirname, 'ffmpeg');
// const ffmpegPath = path.resolve(binPath, 'ffmpeg');
// const ffprobePath = path.resolve(binPath, 'ffprobe');

// const ffmpeg = require('fluent-ffmpeg');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

// ffmpeg.setFfmpegPath(ffmpegPath);
// ffmpeg.setFfprobePath(ffprobePath);


const rimraf = require('rimraf');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const thumbnailBucket = storage.bucket(config.thumbnail_bucket);
const videoBucket = storage.bucket(config.video_bucket);

function downloadFile(file, fileName) {
    const destination = '/tmp/' + fileName;
    console.log('downloading ' + file + 'to ' + destination);
    
    return new Promise((resolve, reject) => {
        file.download({
            destination: destination
        }).then((error) => {
            if (error.length > 0) {
                console.log('error downloading video file',error);
                reject(error);
            } else {
                console.log('successfully downloaded file to', destination);
                resolve(destination);
            }
        })
    });
}

exports.analyzeVideo = function analyzeVideo (data, context, callback) {
    
    const allowedFileTypes = ["mp4", "mpeg4", "avi", "webm", "mov", "mpg"];
    const file = data;

        const isDelete = file.resourceState === 'not_exists';

        if (isDelete) {
         console.log(`File ${file.name} deleted.`);
        } else {
            const bucketName = file.bucket;
            console.log('fileinfo -- ',file);
            const fileName = file.name;
            const fileType = fileName.split('.').pop();
    
            if (allowedFileTypes.indexOf(fileType.toLowerCase()) != -1) {

                const request = {
                    inputUri: "gs://" + bucketName + '/' + fileName,
                    outputUri: "gs://teslacam_json_output/" + fileName.replace(".", "").replace("/", "") + ".json",
                    features: ['LABEL_DETECTION']
                }

                console.log('PROCESS FILE...', request);

    
                client.annotateVideo(request)
                    .then(results => {
                        const operation = results[0];
                        console.log('waiting for annotations');
                        return operation.promise();
                })
                .then(results => {
                    const annotations = results[0].annotationResults[0];
                    console.log('got annotations', annotations);
                    // TODO: How to add this to store?
                })
                .catch(err => {
                    console.error('Error getting video annotations: ', err);
                });
    
            } else {
                console.log(videoFilename + " is not a video file.")
            }
    
        }


    callback();
}

exports.generateThumbnail = function generateThumbnail (data, context, callback) {
    Promise.resolve()
      .then(() => {
        rimraf('/tmp', function() { console.log('deleted tmp/') });

        console.log('GEN THUMB', data);
        const file = data;

        if (file) {
            const isDelete = file.resourceState === 'not_exists';
    
            if (isDelete) {
                console.log('deleting file');
                return true;
            } else {
                
                const fileName = file.name;
                const videoFile = videoBucket.file(fileName);
                console.log('downloading file...', fileName)
                return downloadFile(videoFile, fileName);
            }
        } else {
            console.error('NO FILE FOUND');
        }
      }).then((fileinfo) => {
        const fileName = fileinfo;
        console.log(fileName);

        if (fileName) {
            let pngFilepath = fileName.substr(5, data.name.lastIndexOf('.')).replace(".", "").replace("/", "") + '.png';

            return new Promise((resolve, reject) => {
                ffmpeg(fileName)
                    .screenshots({
                        count: 1,
                        timemarks: ['33%'],
                        size: '230x144',
                        folder: '/tmp',
                        filename: pngFilepath
                    })
                    .frames(1)
                    .on('end', function() {
                        console.log('got a thumbnail at ' + pngFilepath);
                        resolve(pngFilepath); 
                    })
                    .on('error', function(err, stdout, stderr) {
                        console.log('error generating thumbnail:', err.message);
                        reject(err);
                    });
                    // .run()
            }); 
        } else {
            Promise.reject('OOPS');
        }

      }).then((thumbnailPath) => {
        return new Promise((resolve, reject) => {
            console.log('preparing to upload thumbnail to GCS...');
            console.log('looking for file in ' + thumbnailPath);
            thumbnailBucket.upload('/tmp/' + thumbnailPath, function(uploadErr, file, uploadResp) {
                if (uploadErr) {
                    reject(uploadErr);
                } else {
                    console.log('successfully uploaded thumbnail to GCS');
                    resolve(file);
                }
                
            }); 
        });           
      })       
      .catch((err) => {
        return Promise.reject(err);
      });
}

exports.generatePreview = function generatePreview(data, context, callback) {
    Promise.resolve()
      .then(() => {
        rimraf('/tmp', function() { console.log('deleted tmp/') });

        console.log('GEN PREVIEW', data);
        const file = data;

        if (file) {
            const isDelete = file.resourceState === 'not_exists';
    
            if (isDelete) {
                console.log('deleting file');
                return true;
            } else {
                
                const fileName = file.name;
                const videoFile = videoBucket.file(fileName);
                console.log('downloading file...', fileName);
                return downloadFile(videoFile, fileName);
            }
        } else {
            console.error('NO FILE FOUND');
        }
      }).then((fileinfo) => {
        const fileName = fileinfo;
        console.log(fileName);

        if (fileName) {
            let pngFilepath = fileName.substr(5, data.name.lastIndexOf('.')).replace(".", "").replace("/", "") + '-preview.png';

            return new Promise((resolve, reject) => {
                ffmpeg(fileName)
                    .screenshots({
                        count: 1,
                        timemarks: ['33%'],
                        size: '699x394',
                        folder: '/tmp',
                        filename: pngFilepath
                    })
                    .frames(1)
                    .on('end', function() {
                        console.log('got a thumbnail at ' + pngFilepath);
                        resolve(pngFilepath); 
                    })
                    .on('error', function(err, stdout, stderr) {
                        console.log('error generating thumbnail:', err.message);
                        reject(err);
                    });
            });   
        } else{
            Promise.reject('OOPS');
        }         
      }).then((thumbnailPath) => {
        return new Promise((resolve, reject) => {
            console.log('preparing to upload thumbnail to GCS...');
            console.log('looking for file in ' + thumbnailPath);
            thumbnailBucket.upload('/tmp/' + thumbnailPath, function(uploadErr, file, uploadResp) {
                if (uploadErr) {
                    reject(uploadErr);
                } else {
                    console.log('successfully uploaded thumbnail to GCS');
                    resolve(file);
                }
                
            }); 
        });           
      })       
      .catch((err) => {
        return Promise.reject(err);
      });
}