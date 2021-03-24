var socket = io(window.location.origin);

socket.emit('connect');

var frustrated = [],
  lost = [],
  lostinterest = [],
  intrigued = [],
  excited = [],
  aha = [];

var counters = [0, 0, 0, 0, 0, 0];
const body_elements_ids = ['top_nav', 'sidebar', 'frustrated', 'lost', 'lostinterest', 'intrigued', 'excited', 'aha', 'feeling_summary'];
const body_elements_labels = [];
body_elements_ids.forEach(function(element) {
  body_elements_labels.push(element + '_top_y');
  body_elements_labels.push(element + '_bottom_x');
  body_elements_labels.push(element + '_bottom_y');
  body_elements_labels.push(element + '_top_x');
})

socket.on('affective_states_data_receive', data => {
  if (data != []) {
    data.forEach(function(i) {
      switch (i[1]) {
        case 'frustrated':
          counters[0] += 1;
          frustrated.push(i[0]);
          document.getElementById("frustrated_counter").innerText = counters[0];
          break;
        case 'confused':
          counters[1] += 1;
          lost.push(i[0]);
          document.getElementById("lost_counter").innerText = counters[1];
          break;
        case 'bored':
          counters[2] += 1;
          lostinterest.push(i[0]);
          document.getElementById("lostinterest_counter").innerText = counters[2];
          break;
        case 'interested':
          counters[3] += 1;
          intrigued.push(i[0]);
          document.getElementById("intrigued_counter").innerText = counters[3];
          break;
        case 'inspired':
          counters[4] += 1;
          excited.push(i[0]);
          document.getElementById("excited_counter").innerText = counters[4];
          break;
        case 'aha':
          counters[5] += 1;
          aha.push(i[0]);
          document.getElementById("aha_counter").innerText = counters[5];
          break;
        default:
          break;
      }
    });
  }
  bindPage();
});

socket.on('connected', function() {
  // kick off the demo
  socket.emit('affective_states_data_receive');
});

const videoWidth = 600;
const videoHeight = 500;
var videoEnded = false;
var playBegin = false;
const video_element = document.getElementById("my-video");

document.onkeydown = function(e) {
  if (e.ctrlKey && e.shiftKey && e.which == 66) {
    // "Ctrl + Shift + B shortcut combination was pressed"
    // console.log("Ctrl + Shift + B");
    webgazer.showPredictionPoints(false);
  } else if (e.ctrlKey && e.which == 66) {
    // "Ctrl + B shortcut combination was pressed"
    // console.log("Ctrl + B");
    webgazer.showPredictionPoints(true);
  }
};

var myPlayer = videojs('my-video', {
  playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  plugins: {
    hotkeys: {}
  }
});

myPlayer.on('ended', function() {
  if (videoEnded == false) {
    videoEnded = true;
    document.getElementById("feeling_summary").click();

    if (poses_to_socket.length > 0) {
      socket.emit('pose_data', JSON.stringify({ 'predictions': poses_to_socket }));
      poses_to_socket = [];
    }

    if (emotions_to_socket.length > 0) {
      socket.emit('emotion_data', JSON.stringify({ 'predictions': emotions_to_socket }));
      emotions_to_socket = [];
    }

    if (eyes_to_socket.length > 0) {
      socket.emit('eye_data', JSON.stringify({ 'predictions': eyes_to_socket }));
      eyes_to_socket = [];
    }
  } else {
    return;
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Loads a the camera to be used in the demo
async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const video = document.getElementById('video');
  video.width = videoWidth;
  video.height = videoHeight;

  const stream = await navigator.mediaDevices.getUserMedia({
    'audio': false,
    'video': {
      facingMode: 'user',
      width: videoWidth,
      height: videoHeight,
    },
  });
  video.srcObject = stream;

  return new Promise((resolve) => {
    video.onloadedmetadata = () => {
      resolve(video);
    };
  });
}

async function loadVideo() {
  const video = await setupCamera();
  video.play();

  return video;
}

const defaultQuantBytes = 2;

const defaultMobileNetMultiplier = 0.75;
const defaultMobileNetStride = 16;
const defaultMobileNetInputResolution = 500;

const defaultResNetMultiplier = 1.0;
const defaultResNetStride = 32;
const defaultResNetInputResolution = 250;

const guiState = {
  algorithm: 'multi-pose',
  input: {
    architecture: 'MobileNetV1',
    outputStride: defaultMobileNetStride,
    inputResolution: defaultMobileNetInputResolution,
    multiplier: defaultMobileNetMultiplier,
    quantBytes: defaultQuantBytes
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5,
  },
  multiPoseDetection: {
    maxPoseDetections: 5,
    minPoseConfidence: 0.15,
    minPartConfidence: 0.1,
    nmsRadius: 30.0,
  },
  net: null,
};

function detectInRealTime(video) {
  const flipPoseHorizontal = true;

  async function poseDetectionFrame() {
    // console.log("heel no");

    async function pose_interval() {
      let poses = [];
      let timeframe;
      let timeframe_world;
      let rect;
      let visibility = true;

      if (document.visibilityState != "visible") {
        visibility = false;
      }
      rect = video_element.getBoundingClientRect();
      timeframe_world = Date.now();
      timeframe = myPlayer.currentTime()
      let all_poses = await guiState.net.estimatePoses(video, {
        flipHorizontal: flipPoseHorizontal,
        decodingMethod: 'multi-person',
        maxDetections: guiState.multiPoseDetection.maxPoseDetections,
        scoreThreshold: guiState.multiPoseDetection.minPartConfidence,
        nmsRadius: guiState.multiPoseDetection.nmsRadius
      });

      poses = poses.concat(all_poses);

      formatPoses(poses, visibility, rect, timeframe, timeframe_world, getElementPositions());
      await delay(500);
      if (!videoEnded) {
        pose_interval();
      } else {
        return;
      }
    }
    pose_interval();
  }

  function emotionDetectionFrame() {
    // console.log("heel no");

    const canvas = faceapi.createCanvasFromMedia(video);
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);

    async function emotion_interval() {
      let emotions = [];
      let timeframe;
      let timeframe_world;
      let rect;
      let visibility = true;

      if (document.visibilityState != "visible") {
        visibility = false;
      }
      rect = video_element.getBoundingClientRect();
      timeframe_world = Date.now();
      timeframe = myPlayer.currentTime();
      const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceExpressions();
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      emotions = resizedDetections;

      formatEmotions(emotions, visibility, rect, timeframe, timeframe_world, getElementPositions());

      await delay(500);
      if (!videoEnded) {
        emotion_interval();
      } else {
        return;
      }
    }
    emotion_interval();
  };

  function eyeTrackingFrame() {
    // console.log("heel no");

    async function eyeTracking_interval() {
      let eyetracks = [];
      let timeframe;
      let timeframe_world;
      let rect;
      let visibility = true;

      if (document.visibilityState != "visible") {
        visibility = false;
      }
      rect = video_element.getBoundingClientRect();
      timeframe_world = Date.now();
      timeframe = myPlayer.currentTime();
      var prediction = await webgazer.getCurrentPrediction();
      if (prediction) {
        var x = prediction.x;
        var y = prediction.y;
        eyetracks = [x, y];

        formatEyeTracks(eyetracks, visibility, rect, timeframe, timeframe_world, getElementPositions());
      } else {
        formatEyeTracks([], visibility, rect, timeframe, timeframe_world, getElementPositions());
      }

      await delay(500);
      if (!videoEnded) {
        eyeTracking_interval();
      } else {
        return;
      }
    }
    eyeTracking_interval()
  };

  // Run eye tracking
  eyeTrackingFrame();

  // Run emotion detection
  emotionDetectionFrame();

  // Run pose detection
  poseDetectionFrame();
}

async function bindPage() {
  let video;

  try {
    video = await loadVideo();

    // initialize the pose data csv file
    let a = ['browser_active', 'world_timestamp', 'video_timestamp', 'video_top_y', 'video_bottom_x', 'video_bottom_y', 'video_top_x', 'person', 'confidence'];
    let b = ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];

    for (let i = 0; i < 17; i++) {
      a.push(b[i] + '_confidence', b[i] + '_x', b[i] + '_y');
    }
    socket.emit('pose_data', JSON.stringify({
      'predictions': [
        [a.concat(body_elements_labels)]
      ]
    }));

    // initialize the emotion data csv file
    let c = ['browser_active', 'world_timestamp', 'video_timestamp', 'video_top_y', 'video_bottom_x', 'video_bottom_y', 'video_top_x', 'person', 'angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sad', 'surprised'];
    socket.emit('emotion_data', JSON.stringify({
      'predictions': [
        [c.concat(body_elements_labels)]
      ]
    }));

    // initialize the eye tracking csv file
    let d = ['browser_active', 'world_timestamp', 'video_timestamp', 'video_top_y', 'video_bottom_x', 'video_bottom_y', 'video_top_x', 'x', 'y'];
    socket.emit('eye_data', JSON.stringify({
      'predictions': [
        [d.concat(body_elements_labels)]
      ]
    }));

    let f = ['world_timestamp', 'video_timestamp', 'action'];
    socket.emit('clickstream', JSON.stringify({
      'clickstream': [
        [f]
      ]
    }));
  } catch (e) {
    document.getElementById("setting_gear_text").innerText = "No camera detected!";
    document.getElementById("setting_gear_text").classList.add('text-danger');
    document.getElementById("setting_gear_image").hidden = true;
    return;
  }

  // document.getElementById("loading_image_camera").hidden = true;
  // document.getElementById("loading_image_model").hidden = false;
  // document.getElementById("loading_label").innerText = "Loading models";

  // Loading models

  // Loading emotion detector
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/static/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/static/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/static/models'),
    faceapi.nets.faceExpressionNet.loadFromUri('/static/models')
  ])

  // Loading webgazer
  webgazer
    .showPredictionPoints(false)
    .showVideo(false)
    .showFaceOverlay(false)
    .showFaceFeedbackBox(false);
  await webgazer.begin();

  // Loading posenet
  const net = await posenet.load({
    architecture: guiState.input.architecture,
    outputStride: guiState.input.outputStride,
    inputResolution: guiState.input.inputResolution,
    multiplier: guiState.input.multiplier,
    quantBytes: guiState.input.quantBytes
  });

  guiState.net = net;

  document.getElementById('instructional_video').hidden = false;
  document.getElementById("setting_gear").hidden = true;
  document.getElementById('sidebar_vid_button').disabled = false;
  document.getElementById('feeling_summary').disabled = false;

  myPlayer.on('playing', function() {
    let world_ts = Date.now();
    let currentTime = myPlayer.currentTime();
    clickstream.push([world_ts, currentTime, 'play']);
    clickstream_tosend();
    if (!playBegin) {
      playBegin = true;
      ["lost", "frustrated", "lostinterest", "intrigued", "excited", "aha"].forEach(function(x) {
        document.getElementById(x).disabled = false;
      });
      detectInRealTime(video);
    } else {
      return;
    }
  });
  myPlayer.on('pause', function() {
    let world_ts = Date.now();
    let currentTime = myPlayer.currentTime();
    clickstream.push([world_ts, currentTime, 'pause']);
    clickstream_tosend();
  });
}

navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

var poses_to_socket = [],
  emotions_to_socket = [],
  eyes_to_socket = [];
var max_lim_socket = 200;
var clickstream = [];

function formatPoses(poses, visibility, rect, timeframe, timeframe_world, ElementPositions) {
  // Sends pose predictions as CSV row

  // console.log("poses are going");

  var minPoseConfidence, minPartConfidence;

  minPoseConfidence = guiState.multiPoseDetection.minPoseConfidence;
  minPartConfidence = guiState.multiPoseDetection.minPartConfidence;

  var list_records = []

  var temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left];
  if (poses.length == 0) {
    list_records.push(temp);
  } else {
    var counter = 0;
    poses.forEach(function(person, j) {
      if (person["score"] >= minPoseConfidence) {
        temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left, counter, person["score"]];
        counter += 1;

        person["keypoints"].forEach(function(body_part) {
          if (body_part["score"] >= minPartConfidence) {
            temp.push(body_part["score"], body_part["position"]["x"], body_part["position"]["y"]);
          } else {
            temp.push(null, null, null);
          }
        });
        list_records.push(temp);
      };
    });
    if (counter == 0) {
      temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left];
      list_records.push(temp);
    }
  }

  poses_to_socket.push([list_records[0].concat(ElementPositions)]);
  if (poses_to_socket.length > max_lim_socket) {
    socket.emit('pose_data', JSON.stringify({ 'predictions': poses_to_socket }));
    poses_to_socket = [];
  }
  return;
};

function formatEmotions(emotions, visibility, rect, timeframe, timeframe_world, ElementPositions) {
  // Sends emotion predictions as CSV row
  // console.log("emotions are going");

  let emotion_labels = ['angry', 'disgusted', 'fearful', 'happy', 'neutral', 'sad', 'surprised'];
  var list_records = [];
  var temp;

  if (emotions.length == 0) {
    temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left];
    list_records.push(temp);
  } else {
    emotions.forEach(function(person, j) {
      temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left, j];

      emotion_labels.forEach(function(label) {
        temp.push(person['expressions'][label]);
      });
      list_records.push(temp);
    });
  }

  emotions_to_socket.push([list_records[0].concat(ElementPositions)]);
  if (emotions_to_socket.length > max_lim_socket) {
    socket.emit('emotion_data', JSON.stringify({ 'predictions': emotions_to_socket }));
    emotions_to_socket = [];
  }
  return;
};

function formatEyeTracks(eyetracks, visibility, rect, timeframe, timeframe_world, ElementPositions) {
  // Sends eye track predictions as CSV row
  // console.log("eyes are going");

  var list_records = [];

  if (eyetracks.length == 0) {
    var temp = [visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left];
    list_records.push(temp);
  } else {
    list_records.push([visibility, timeframe_world, timeframe, rect.top, rect.right, rect.bottom, rect.left, eyetracks[0], eyetracks[1]]);
  }

  eyes_to_socket.push([list_records[0].concat(ElementPositions)]);
  if (eyes_to_socket.length > max_lim_socket) {
    socket.emit('eye_data', JSON.stringify({ 'predictions': eyes_to_socket }));
    eyes_to_socket = [];
  }
  return;
};

document.getElementById('frustrated').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  frustrated.push(currentTime);
  counters[0] += 1;
  document.getElementById("frustrated_counter").innerText = counters[0];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'frustrated']
  ]))
  clickstream.push([world_ts, currentTime, 'frustrated']);
  clickstream_tosend();
}
document.getElementById('lost').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  lost.push(currentTime);
  counters[1] += 1;
  document.getElementById("lost_counter").innerText = counters[1];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'confused']
  ]))
  clickstream.push([world_ts, currentTime, 'confused']);
  clickstream_tosend();
}
document.getElementById('lostinterest').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  lostinterest.push(currentTime);
  counters[2] += 1;
  document.getElementById("lostinterest_counter").innerText = counters[2];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'bored']
  ]))
  clickstream.push([world_ts, currentTime, 'bored']);
  clickstream_tosend();
}
document.getElementById('intrigued').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  intrigued.push(currentTime);
  counters[3] += 1;
  document.getElementById("intrigued_counter").innerText = counters[3];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'interested']
  ]))
  clickstream.push([world_ts, currentTime, 'interested']);
  clickstream_tosend();
}
document.getElementById('excited').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  excited.push(currentTime);
  counters[4] += 1;
  document.getElementById("excited_counter").innerText = counters[4];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'inspired']
  ]))
  clickstream.push([world_ts, currentTime, 'inspired']);
  clickstream_tosend();
}
document.getElementById('aha').onclick = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime()
  aha.push(currentTime);
  counters[5] += 1;
  document.getElementById("aha_counter").innerText = counters[5];
  socket.emit('affective_states_data_store', JSON.stringify([
    [currentTime, 'aha']
  ]))
  clickstream.push([world_ts, currentTime, 'aha']);
  clickstream_tosend();
}

const save = document.getElementById('save');
const summary_button = document.getElementById('feeling_summary');

summary_button.onclick = function() {
  document.getElementById('body_graph_container').hidden = false;
  if (document.body.contains(document.getElementById('documentation_div'))) {
    document.getElementById('documentation_div').hidden = true;
  }
  document.getElementById('body_video_container').hidden = true;

  let colors = [
    '#773BED', '#42A2E3', '#57C7C3', '#FAC535', '#FA8053', '#E63F5F', '#A355C8', '#CB59AE', '#DA608C', '#DC7A6E', '#E6A893', '#B1332C', '#CF5D3A', '#E18345', '#E39D4E', '#E4BE55', '#E7E268'
  ];

  let duration = myPlayer.duration();

  let labels = [];
  let interval_length = 60;
  if (interval_length < duration) {
    for (let i = interval_length; i < duration; i += interval_length) {
      labels.push(i);
    };
    if (duration != Math.ceil(duration)) {
      labels.push(labels[labels.length - 1] + interval_length);
    }
  } else {
    labels.push(interval_length)
  }

  var datasets = [];
  var feelings_pretty = ["Frustrated", "Confused", "Bored", "Interested", "Inspired", "Ah-ha!"];
  [frustrated, lost, lostinterest, intrigued, excited, aha].forEach(function(feeling, i) {
    let feeling_temp = [];
    labels.forEach(function(timelimit, t) {
      let temp = 0;
      for (let j = 0; j < feeling.length; j++) {
        if (t == 0 && feeling[j] < timelimit) {
          temp += 1;
        } else if (feeling[j] < timelimit && feeling[j] > labels[t - 1]) {
          temp += 1;
        }
      }
      feeling_temp.push(temp);
    });
    datasets.push({
      label: feelings_pretty[i],
      backgroundColor: colors[i],
      data: feeling_temp
    });
  });

  document.getElementById("chartContainer").innerHTML = '<canvas id="myChart"></canvas>';
  var ctx = document.getElementById("myChart").getContext("2d");

  var myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(function toMinutes(label) { return label / 60 }),
      datasets: datasets
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        yAxes: [{
          stacked: true,
          scaleLabel: {
            display: true,
            labelString: 'Number of Clicked Tags',
            fontColor: "#59616F"
          },
          ticks: {
            min: 0,
            stepSize: 1,
            fontColor: "#A0A8B4"
          }
        }],
        xAxes: [{
          stacked: true,
          scaleLabel: {
            display: true,
            labelString: 'Video Time Interval (Minutes)',
            fontColor: "#59616F"
          },
          ticks: {
            fontColor: "#A0A8B4"
          }
        }]
      },
      title: {
        display: true,
        text: 'Tagged Affective States',
        fontColor: "black",
      },
      legend: {
        labels: {
          fontColor: "#59616F",
          usePointStyle: true
        }
      },
    }
  });

  socket.emit('send_class_states');
  // document.getElementById('graph_div').hidden = false;
};

socket.on('receive_class_states', data => {
  let colors = [
    '#773BED', '#42A2E3', '#57C7C3', '#FAC535', '#FA8053', '#E63F5F', '#A355C8', '#CB59AE', '#DA608C', '#DC7A6E', '#E6A893', '#B1332C', '#CF5D3A', '#E18345', '#E39D4E', '#E4BE55', '#E7E268'
  ];

  var frustrated2 = [],
    lost2 = [],
    lostinterest2 = [],
    intrigued2 = [],
    excited2 = [],
    aha2 = [];
  data.forEach(function(i) {
    i[0] = parseFloat(i[0]);
    switch (i[1]) {
      case 'frustrated':
        frustrated2.push(i[0]);
        break;
      case 'confused':
        lost2.push(i[0]);
        break;
      case 'bored':
        lostinterest2.push(i[0]);
        break;
      case 'interested':
        intrigued2.push(i[0]);
        break;
      case 'inspired':
        excited2.push(i[0]);
        break;
      case 'aha':
        aha2.push(i[0]);
        break;
      default:
        break;
    }
  })

  let duration = myPlayer.duration();

  let labels = [];
  let interval_length = 60;
  if (interval_length < duration) {
    for (let i = interval_length; i < duration; i += interval_length) {
      labels.push(i);
    };
    if (duration != Math.ceil(duration)) {
      labels.push(labels[labels.length - 1] + interval_length);
    }
  } else {
    labels.push(interval_length)
  }

  var datasets = [];
  var feelings_pretty = ["Frustrated", "Confused", "Bored", "Interested", "Inspired", "Ah-ha!"];
  [frustrated2, lost2, lostinterest2, intrigued2, excited2, aha2].forEach(function(feeling, i) {
    let feeling_temp = [];
    labels.forEach(function(timelimit, t) {
      let temp = 0;
      for (let j = 0; j < feeling.length; j++) {
        if (t == 0 && feeling[j] < timelimit) {
          temp += 1;
        } else if (feeling[j] < timelimit && feeling[j] > labels[t - 1]) {
          temp += 1;
        }
      }
      feeling_temp.push(temp);
    });
    datasets.push({
      label: feelings_pretty[i],
      backgroundColor: colors[i],
      data: feeling_temp
    });
  });

  document.getElementById("chartContainer2").innerHTML = '<canvas id="myChart2"></canvas>';
  var ctx = document.getElementById("myChart2").getContext("2d");

  var myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(function toMinutes(label) { return label / 60 }),
      datasets: datasets
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        yAxes: [{
          stacked: true,
          scaleLabel: {
            display: true,
            labelString: 'Number of Clicked Tags',
            fontColor: "#59616F"
          },
          ticks: {
            min: 0,
            fontColor: "#A0A8B4"
          }
        }],
        xAxes: [{
          stacked: true,
          scaleLabel: {
            display: true,
            labelString: 'Video Time Interval (Minutes)',
            fontColor: "#59616F"
          },
          ticks: {
            fontColor: "#A0A8B4"
          }
        }]
      },
      title: {
        display: true,
        text: 'Tagged Affective States',
        fontColor: "black",
      },
      legend: {
        labels: {
          fontColor: "#59616F",
          usePointStyle: true
        }
      },
    }
  });
});

const hamburger = document.getElementById("menu-btn");
var navbar_collapse = false;

hamburger.addEventListener("click", async function() {
  if (!navbar_collapse) {
    hamburger.classList.remove("open");

    document.getElementById("sidebar").style.width = "72px";

    let x = document.getElementById("sidebar").querySelectorAll("p");
    for (var i = 0; i < x.length; i++) {
      x[i].hidden = true;
    }

    let y = document.getElementById("sidebar").querySelectorAll("button:not(.hamburger)");
    for (var i = 0; i < y.length; i++) {
      y[i].hidden = true;
    }
    navbar_collapse = true;
  } else {
    hamburger.classList.add("open");

    document.getElementById("sidebar").style.width = "400px";

    await delay(500);

    let x = document.getElementById("sidebar").querySelectorAll("p");
    for (var i = 0; i < x.length; i++) {
      x[i].hidden = false;
    }

    let y = document.getElementById("sidebar").querySelectorAll("button:not(.hamburger)");
    for (var i = 0; i < y.length; i++) {
      y[i].hidden = false;
    }
    navbar_collapse = false;
  }
})

const body_elements = body_elements_ids.map(x => document.getElementById(x));

function getElementPositions() {
  let rects = [];
  body_elements.forEach(function(element) {
    let rect = element.getBoundingClientRect();
    rects.push(rect.top, rect.right, rect.bottom, rect.left);
  })
  return rects;
}

document.getElementById("sidebar_vid_button").addEventListener("click", function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime();
  clickstream.push([world_ts, currentTime, 'video']);
  clickstream_tosend();
})

document.getElementById("feeling_summary").addEventListener("click", function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime();
  clickstream.push([world_ts, currentTime, 'summary']);
  clickstream_tosend();
})

var clickstream_max_len = 5;

function clickstream_tosend() {
  if (clickstream.length >= clickstream_max_len) {
    // Send off data
    socket.emit('clickstream', JSON.stringify({ 'clickstream': [clickstream] }));
    console.log(clickstream)
    clickstream = [];
  }
}

window.onfocus = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime();
  clickstream.push([world_ts, currentTime, 'tab_active']);
  clickstream_tosend();
};

window.onblur = function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime();
  clickstream.push([world_ts, currentTime, 'tab_inactive']);
  clickstream_tosend();
};

document.addEventListener("visibilitychange", function() {
  let world_ts = Date.now();
  let currentTime = myPlayer.currentTime();
  clickstream.push([world_ts, currentTime, "document_" + document.visibilityState]);
  clickstream_tosend();
})

window.addEventListener("keydown", function(e) {
  if (e.ctrlKey && e.key == "1") {
    document.getElementById('frustrated').click();
  } else if (e.ctrlKey && e.key == "2") {
    document.getElementById('lost').click();
  } else if (e.ctrlKey && e.key == "3") {
    document.getElementById('lostinterest').click();
  } else if (e.ctrlKey && e.key == "4") {
    document.getElementById('intrigued').click();
  } else if (e.ctrlKey && e.key == "5") {
    document.getElementById('excited').click();
  } else if (e.ctrlKey && e.key == "6") {
    document.getElementById('aha').click();
  }
})

function addNewScrollButton(data) {
  var myPlayer = data.player,
    controlBar,
    newElement = document.createElement('div')

  newElement.className = 'vjs-playback-rate vjs-menu-button vjs-menu-button-popup vjs-control vjs-button';
  newElement.style.width = "60px";

  newElement.innerHTML = "<div class='vjs-playback-rate-value'>Feeling?</div><button class='vjs-playback-rate vjs-menu-button vjs-menu-button-popup vjs-button' type='button' aria-disabled='false' title='Playback Rate' aria-haspopup='true' aria-expanded='false'><span aria-hidden='true' class='vjs-icon-placeholder'></span><span class='vjs-control-text' aria-live='polite'>Playback Rate</span></button><div class='vjs-menu' style='width: 60px !important;'><ul class='vjs-menu-content' role='menu'><li id='controlbar_frustrated' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Frustrated</span><span class='vjs-control-text' aria-live='polite'></span></li><li id='controlbar_confused' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Confused</span><span class='vjs-control-text' aria-live='polite'></span></li><li id='controlbar_bored' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Bored</span><span class='vjs-control-text' aria-live='polite'></span></li><li id='controlbar_interested' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Interested</span><span class='vjs-control-text' aria-live='polite'>, selected</span></li><li id='controlbar_inspired' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Inspired</span><span class='vjs-control-text' aria-live='polite'></span></li><li id='controlbar_aha' class='vjs-menu-item' role='menuitemradio' aria-disabled='false' tabindex='-1' aria-checked='false'><span class='vjs-menu-item-text'>Ah-ha!</span><span class='vjs-control-text' aria-live='polite'></span></li></ul></div>";
  // newElement.appendChild(newSpan);
  controlBar = document.getElementsByClassName('vjs-control-bar')[0];
  // insertBeforeNode = document.getElementsByClassName('vjs-fullscreen-control')[0];
  controlBar.insertBefore(newElement, document.getElementsByClassName('vjs-fullscreen-control')[0]);

  return newElement;
}

var btna = addNewScrollButton({
  player: myPlayer
});
btna.onmouseover = function() {
  btna.classList.add("vjs-hover");
};
btna.onmouseout = function() {
  btna.classList.remove("vjs-hover");
};

document.getElementById('controlbar_frustrated').onclick = function() {
  document.getElementById('frustrated').click();
  btna.classList.remove("vjs-hover");
};
document.getElementById('controlbar_confused').onclick = function() {
  document.getElementById('lost').click();
  btna.classList.remove("vjs-hover");
};
document.getElementById('controlbar_bored').onclick = function() {
  document.getElementById('lostinterest').click();
  btna.classList.remove("vjs-hover");
};
document.getElementById('controlbar_interested').onclick = function() {
  document.getElementById('intrigued').click();
  btna.classList.remove("vjs-hover");
};
document.getElementById('controlbar_inspired').onclick = function() {
  document.getElementById('excited').click();
  btna.classList.remove("vjs-hover");
};
document.getElementById('controlbar_aha').onclick = function() {
  document.getElementById('aha').click();
  btna.classList.remove("vjs-hover");
};