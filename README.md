
<h1 align="center">Vision Camera</h1>

<div align="center">
  <img src="docs/static/img/11.png" width="50%">
  <br />
  <br />
  <blockquote><b>📸 The Camera library that sees the vision.</b></blockquote>
  <pre align="center">npm i <a href="https://www.npmjs.com/package/react-native-vision-camera">react-native-vision-camera</a><br/>npx pod-install                 </pre>
  <a align="center" href='https://ko-fi.com/F1F8CLXG' target='_blank'>
    <img height='36' style='border:0px;height:36px;' src='https://az743702.vo.msecnd.net/cdn/kofi2.png?v=0' border='0' alt='Buy Me a Coffee at ko-fi.com' />
  </a>
  <br/>
  <a align="center" href="https://github.com/mrousavy?tab=followers">
    <img src="https://img.shields.io/github/followers/mrousavy?label=Follow%20%40mrousavy&style=social" />
  </a>
  <br />
  <a align="center" href="https://twitter.com/mrousavy">
    <img src="https://img.shields.io/twitter/follow/mrousavy?label=Follow%20%40mrousavy&style=social" />
  </a>
</div>

<br/>
<br/>

<div>
  <img align="right" width="35%" src="docs/static/img/example.png">
</div>

### Documentation

* [Guides](https://mrousavy.github.io/react-native-vision-camera/docs/guides)
* [API](https://mrousavy.github.io/react-native-vision-camera/docs/api)
* [Example](./example/)

### Features

* Record Multi Video
* Progress Bar
* Timer
* Delete Video
* Record Durations
* Record Speed

> See the [example](./example/) app

### New Props

#### maxDurations?: 15 | 30 | 60;

#### minDurations?: number;

#### speed?: number;
* use it if you want to custom speed selection

#### processBarContainerStyle?: StyleProp<ViewProps>;

#### processBarAnimatedStyle?: StyleProp<ViewProps>;

#### captureButtonPaddingBottom?: number;

#### captureButtonSizeN?: number;

#### processingPaddingTop?: number;

#### CaptureButton?: React.FunctionComponent<any>;
* use it if you want to custom Capture Button

#### DeleteButton?: React.FunctionComponent<any>;
* use it if you want to custom delete

#### ChooseSpeedComponent?: React.FunctionComponent<any>;
* use it if you want to custom speed selection
* 
#### ChooseTimeComponent?: React.FunctionComponent<any>;
* use it if you want to custom duration selection

#### TimerComponent?: React.FunctionComponent<any>;
* use it if you want to custom timmer component

#### DoneButtonComponent?: React.FunctionComponent<any>;
* use it if you want to custom done button component

#### SPEEDS?: [number];
* use it if you want to custom speed selection

#### DURATIONS?: [number];
* use it if you want to custom duration selection

#### onPressDoneButton?: (arg0: any) =>  void;

## Please see the example for more detail.
