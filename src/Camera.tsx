/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React from 'react';
import {
  requireNativeComponent,
  NativeModules,
  NativeSyntheticEvent,
  findNodeHandle,
  NativeMethods,
  Platform,
  View,
  Animated,
  StyleSheet,
  Image,
  TouchableOpacity,
  Text,
} from 'react-native';
import type { FrameProcessorPerformanceSuggestion, VideoFileType } from '.';
import type { CameraDevice } from './CameraDevice';
import type { ErrorWithCause } from './CameraError';
import { CameraCaptureError, CameraRuntimeError, tryParseNativeCameraError, isErrorWithCause } from './CameraError';
import type { CameraProps } from './CameraProps';
import type { Frame } from './Frame';
import type { PhotoFile, TakePhotoOptions } from './PhotoFile';
import type { Point } from './Point';
import type { TakeSnapshotOptions } from './Snapshot';
import type { CameraVideoCodec, RecordVideoOptions, VideoFile } from './VideoFile';
import { SCREEN_WIDTH } from './Constants';
import moment from 'moment';

//#region Types
export type CameraPermissionStatus = 'authorized' | 'not-determined' | 'denied' | 'restricted';
export type CameraPermissionRequestResult = 'authorized' | 'denied';

interface OnErrorEvent {
  code: string;
  message: string;
  cause?: ErrorWithCause;
}
type NativeCameraViewProps = Omit<
  CameraProps,
  'device' | 'onInitialized' | 'onError' | 'onFrameProcessorPerformanceSuggestionAvailable' | 'frameProcessor' | 'frameProcessorFps'
> & {
  cameraId: string;
  frameProcessorFps?: number; // native cannot use number | string, so we use '-1' for 'auto'
  enableFrameProcessor: boolean;
  onInitialized?: (event: NativeSyntheticEvent<void>) => void;
  onError?: (event: NativeSyntheticEvent<OnErrorEvent>) => void;
  onFrameProcessorPerformanceSuggestionAvailable?: (event: NativeSyntheticEvent<FrameProcessorPerformanceSuggestion>) => void;
  onViewReady: () => void;
};
type RefType = React.Component<NativeCameraViewProps> & Readonly<NativeMethods>;
//#endregion

const CameraModule = NativeModules.CameraView;
if (CameraModule == null) console.error("Camera: Native Module 'CameraView' was null! Did you run pod install?");

let interval: any = null;
let totalTime = 0;
let startTime = moment();
let processingTime = 0;
type MyState = { currentTime: number; currentVideoTime: number; videos: any[]; speed: number; maxDurations: number };
const CORESPEEDS = [0.5, 1, 2, 3];
const COREDURATIONS = [60, 30, 15];
export class Camera extends React.PureComponent<CameraProps, MyState> {
  /** @internal */
  static displayName = 'Camera';
  /** @internal */
  displayName = Camera.displayName;
  private lastFrameProcessor: ((frame: Frame) => void) | undefined;
  private isNativeViewMounted = false;

  private readonly ref: React.RefObject<RefType>;

  /** @internal */
  constructor(props: CameraProps) {
    super(props);
    this.onViewReady = this.onViewReady.bind(this);
    this.onInitialized = this.onInitialized.bind(this);
    this.onError = this.onError.bind(this);
    this.onFrameProcessorPerformanceSuggestionAvailable = this.onFrameProcessorPerformanceSuggestionAvailable.bind(this);
    this.ref = React.createRef<RefType>();
    this.lastFrameProcessor = undefined;
  }

  state = {
    currentTime: 0,
    currentVideoTime: 0,
    videos: [],
    processingAnimated: new Animated.Value(0),
    speed: 1,
    maxDurations: 15,
  };
  initState = () => {
    this.setState({
      currentTime: 0,
      currentVideoTime: 0,
      videos: [],
      speed: 1,
      maxDurations: 15,
    });
  };

  timer = () => {
    interval = setInterval(() => {
      this.setState({
        currentVideoTime: 0.01,
      });
      const timeCount = parseFloat(moment.utc(moment().diff(startTime)).format('mmss.SS')) / (this.props.speed || this.state.speed);
      this.setState({
        currentTime: totalTime + timeCount,
        currentVideoTime: timeCount !== 0 ? timeCount : 0.01,
      });
      if (totalTime + timeCount >= (this.props.maxDurations || this.state.maxDurations)) this.stopRecording(true);
    }, 100);
  };

  initTimmer = () => {
    startTime = moment();
    totalTime = 0;
    this.setState({
      currentTime: 0,
      currentVideoTime: 0,
    });
    this.clearTimmer();
  };

  startTimmer = () => {
    this.initTimmer();
    const durationCount: number = (this.props.maxDurations || this.state.maxDurations) * (this.props.speed || this.state.speed);
    Animated.timing(this.state.processingAnimated, {
      toValue: this.props.maxDurations || this.state.maxDurations,
      duration: durationCount * 1000,
      useNativeDriver: false,
    }).start();
    if (!interval) this.timer();
  };

  pauseTimmer = () => {
    processingTime = (this.state.processingAnimated as any)._value;
    Animated.timing(this.state.processingAnimated, {
      toValue: this.props.maxDurations || this.state.maxDurations,
      useNativeDriver: false,
    }).stop();
    this.clearTimmer();
    totalTime = this.state.currentTime;
    this.setState({
      currentVideoTime: 0,
    });
  };

  resumeTimmer = () => {
    startTime = moment();
    Animated.timing(this.state.processingAnimated, {
      toValue: this.props.maxDurations || this.state.maxDurations,
      duration:
        ((this.props.maxDurations || this.state.maxDurations) - this.state.currentTime) * (this.props.speed || this.state.speed) * 1000,
      useNativeDriver: false,
    }).start();
    if (!interval) this.timer();
  };

  stopTimmer = () => {
    this.clearTimmer();
    processingTime = (this.state.processingAnimated as any)._value;
    Animated.timing(this.state.processingAnimated, {
      toValue: 0,
      duration: 0,
      useNativeDriver: false,
    }).start();
    totalTime = this.state.currentTime;
    this.initTimmer();
  };

  clearTimmer = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  deleteLastVideo = () => {
    const videoList = [...this.state.videos];
    const lastListVideo = videoList.slice(0, -1);
    if (lastListVideo.length === 0) {
      if (this.props.onSaveNewVideo) this.props.onSaveNewVideo(lastListVideo);
      this.setState({
        videos: lastListVideo,
      });
      this.stopTimmer();
    } else {
      const lastVideo: any = lastListVideo[lastListVideo.length - 1];
      totalTime = lastVideo?.mainTime || 0;
      if (this.props.onSaveNewVideo) this.props.onSaveNewVideo(lastListVideo);
      this.setState({
        currentTime: lastVideo?.mainTime,
        currentVideoTime: 0,
        videos: lastListVideo,
      });
      Animated.timing(this.state.processingAnimated, {
        toValue: lastVideo?.mainTime || 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };

  /** @internal */
  componentDidMount(): void {
    if (!this.isNativeViewMounted) return;
    const frameProcessor = this.props.frameProcessor;
    if (frameProcessor !== this.lastFrameProcessor) {
      // frameProcessor argument identity changed. Update native to reflect the change.
      if (frameProcessor != null) this.setFrameProcessor(frameProcessor);
      else this.unsetFrameProcessor();

      this.lastFrameProcessor = frameProcessor;
    }
  }

  runderSpeedComponent = () => {
    const speedList = this.props.SPEEDS ? this.props.SPEEDS : CORESPEEDS;
    const { ChooseSpeedComponent } = this.props;
    if (this.state.currentVideoTime !== 0) return null;
    if (ChooseSpeedComponent) return <ChooseSpeedComponent />;
    return (
      <View style={styles.speed}>
        <View style={styles.speedContainer}>
          {speedList.map((item, index) => {
            return (
              <TouchableOpacity
                onPress={() => this.setState({ speed: item })}
                key={index}
                style={[
                  styles.textSpeedContainer,
                  item === this.state.speed && styles.backgroundWhite,
                  { width: SCREEN_WIDTH / (speedList.length + 1) },
                ]}>
                <Text style={[styles.textSpeed, item === this.state.speed && styles.colorGray]}>{`${item}`.replace('.', ',')}x</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  runderMaxDurationsComponent = () => {
    const durationList = this.props.DURATIONS ? this.props.DURATIONS : COREDURATIONS;
    const speedList = this.props.SPEEDS ? this.props.SPEEDS : CORESPEEDS;
    const { ChooseTimeComponent } = this.props;
    if (this.state.currentTime !== 0) return null;
    if (ChooseTimeComponent) return <ChooseTimeComponent />;
    return (
      <View style={styles.duration}>
        <View style={styles.durationContainer}>
          {durationList.map((item, index) => {
            return (
              <TouchableOpacity
                onPress={() => this.setState({ maxDurations: item })}
                key={index}
                style={[
                  styles.textDurationContainer,
                  item === this.state.maxDurations && styles.backgroundTransparent,
                  { width: SCREEN_WIDTH / (speedList.length + 1) },
                ]}>
                <Text style={styles.textSpeed}>{item}s</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  private get handle(): number | null {
    const nodeHandle = findNodeHandle(this.ref.current);
    if (nodeHandle == null || nodeHandle === -1) {
      throw new CameraRuntimeError(
        'system/view-not-found',
        "Could not get the Camera's native view tag! Does the Camera View exist in the native view-tree?",
      );
    }

    return nodeHandle;
  }

  //#region View-specific functions (UIViewManager)
  /**
   * Take a single photo and write it's content to a temporary file.
   *
   * @throws {@linkcode CameraCaptureError} When any kind of error occured while capturing the photo. Use the {@linkcode CameraCaptureError.code | code} property to get the actual error
   * @example
   * ```ts
   * const photo = await camera.current.takePhoto({
   *   qualityPrioritization: 'quality',
   *   flash: 'on',
   *   enableAutoRedEyeReduction: true
   * })
   * ```
   */
  public async takePhoto(options?: TakePhotoOptions): Promise<PhotoFile> {
    try {
      return await CameraModule.takePhoto(this.handle, options ?? {});
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }

  public getCurrentVideos(): any {
    return this.state.videos;
  }

  public stopAllTimmer() {
    this.stopTimmer();
  }

  /**
   * Take a snapshot of the current preview view.
   *
   * This can be used as an alternative to {@linkcode Camera.takePhoto | takePhoto()} if speed is more important than quality
   *
   * @throws {@linkcode CameraCaptureError} When any kind of error occured while taking a snapshot. Use the {@linkcode CameraCaptureError.code | code} property to get the actual error
   *
   * @platform Android
   * @example
   * ```ts
   * const photo = await camera.current.takeSnapshot({
   *   quality: 85,
   *   skipMetadata: true
   * })
   * ```
   */
  public async takeSnapshot(options?: TakeSnapshotOptions): Promise<PhotoFile> {
    if (Platform.OS !== 'android')
      throw new CameraCaptureError('capture/capture-type-not-supported', `'takeSnapshot()' is not available on ${Platform.OS}!`);

    try {
      return await CameraModule.takeSnapshot(this.handle, options ?? {});
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }

  startRecording = (options: RecordVideoOptions): void => {
    const { onRecordingError, onRecordingFinished, ...passThroughOptions } = options;
    if (typeof onRecordingError !== 'function' || typeof onRecordingFinished !== 'function')
      throw new CameraRuntimeError('parameter/invalid-parameter', 'The onRecordingError or onRecordingFinished functions were not set!');

    const onRecordCallback = (video?: VideoFile, error?: CameraCaptureError): void => {
      const recordedVideo = {
        ...video,
        maxDurations: this.props.maxDurations || this.state.maxDurations,
        speed: this.props.speed || this.state.speed,
        mainTime: processingTime,
      };
      const newVideo = [...this.state.videos, recordedVideo];
      if (this.props.onSaveNewVideo) this.props.onSaveNewVideo(newVideo);
      this.setState({
        videos: newVideo,
      });
      if (error != null) return onRecordingError(error);
      if (newVideo.length > 0 && this.state.currentTime === 0) {
        const listVideosFinish = [...this.state.videos];
        this.initState();
        return onRecordingFinished(listVideosFinish);
      }
    };
    // TODO: Use TurboModules to either make this a sync invokation, or make it async.
    try {
      CameraModule.startRecording(this.handle, passThroughOptions, onRecordCallback);
      if (this.state.currentTime === 0) this.startTimmer();
      else this.resumeTimmer();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  };
  /**
   * Stop the current video recording.
   *
   * @throws {@linkcode CameraCaptureError} When any kind of error occured while stopping the video recording. Use the {@linkcode CameraCaptureError.code | code} property to get the actual error
   *
   * @example
   * ```ts
   * await camera.current.startRecording()
   * setTimeout(async () => {
   *  const video = await camera.current.stopRecording()
   * }, 5000)
   * ```
   */
  stopRecording = async (end?: boolean): Promise<void> => {
    try {
      if (this.state.currentVideoTime >= (this.props.minDurations || 3)) {
        const stop = await CameraModule.stopRecording(this.handle);
        if (end) this.stopTimmer();
        else this.pauseTimmer();
        return stop;
      }
    } catch (e) {
      console.log('Stop error: ', e);
      throw tryParseNativeCameraError(e);
    }
  };

  doneRecord = () => {
    this.stopTimmer();
  };

  /**
   * Focus the camera to a specific point in the coordinate system.
   * @param {Point} point The point to focus to. This should be relative to the Camera view's coordinate system,
   * and expressed in Pixel on iOS and Points on Android.
   *  * `(0, 0)` means **top left**.
   *  * `(CameraView.width, CameraView.height)` means **bottom right**.
   *
   * Make sure the value doesn't exceed the CameraView's dimensions.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while focussing. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   * @example
   * ```ts
   * await camera.current.focus({
   *   x: tapEvent.x,
   *   y: tapEvent.y
   * })
   * ```
   */
  public async focus(point: Point): Promise<void> {
    try {
      return await CameraModule.focus(this.handle, point);
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  //#endregion

  /**
   * Get a list of video codecs the current camera supports for a given file type.  Returned values are ordered by efficiency (descending).
   * @example
   * ```ts
   * const codecs = await camera.current.getAvailableVideoCodecs("mp4")
   * ```
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while getting available video codecs. Use the {@linkcode ParameterError.code | code} property to get the actual error
   * @platform iOS
   */
  public async getAvailableVideoCodecs(fileType?: VideoFileType): Promise<CameraVideoCodec[]> {
    if (Platform.OS !== 'ios') return []; // no video codecs supported on other platforms.

    try {
      return await CameraModule.getAvailableVideoCodecs(this.handle, fileType);
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }

  //#region Static Functions (NativeModule)
  /**
   * Get a list of all available camera devices on the current phone.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while getting all available camera devices. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   * @example
   * ```ts
   * const devices = await Camera.getAvailableCameraDevices()
   * const filtered = devices.filter((d) => matchesMyExpectations(d))
   * const sorted = devices.sort(sortDevicesByAmountOfCameras)
   * return {
   *   back: sorted.find((d) => d.position === "back"),
   *   front: sorted.find((d) => d.position === "front")
   * }
   * ```
   */
  public static async getAvailableCameraDevices(): Promise<CameraDevice[]> {
    try {
      return await CameraModule.getAvailableCameraDevices();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  /**
   * Gets the current Camera Permission Status. Check this before mounting the Camera to ensure
   * the user has permitted the app to use the camera.
   *
   * To actually prompt the user for camera permission, use {@linkcode Camera.requestCameraPermission | requestCameraPermission()}.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while getting the current permission status. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   */
  public static async getCameraPermissionStatus(): Promise<CameraPermissionStatus> {
    try {
      return await CameraModule.getCameraPermissionStatus();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  /**
   * Gets the current Microphone-Recording Permission Status. Check this before mounting the Camera to ensure
   * the user has permitted the app to use the microphone.
   *
   * To actually prompt the user for microphone permission, use {@linkcode Camera.requestMicrophonePermission | requestMicrophonePermission()}.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while getting the current permission status. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   */
  public static async getMicrophonePermissionStatus(): Promise<CameraPermissionStatus> {
    try {
      return await CameraModule.getMicrophonePermissionStatus();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  /**
   * Shows a "request permission" alert to the user, and resolves with the new camera permission status.
   *
   * If the user has previously blocked the app from using the camera, the alert will not be shown
   * and `"denied"` will be returned.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while requesting permission. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   */
  public static async requestCameraPermission(): Promise<CameraPermissionRequestResult> {
    try {
      return await CameraModule.requestCameraPermission();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  /**
   * Shows a "request permission" alert to the user, and resolves with the new microphone permission status.
   *
   * If the user has previously blocked the app from using the microphone, the alert will not be shown
   * and `"denied"` will be returned.
   *
   * @throws {@linkcode CameraRuntimeError} When any kind of error occured while requesting permission. Use the {@linkcode CameraRuntimeError.code | code} property to get the actual error
   */
  public static async requestMicrophonePermission(): Promise<CameraPermissionRequestResult> {
    try {
      return await CameraModule.requestMicrophonePermission();
    } catch (e) {
      throw tryParseNativeCameraError(e);
    }
  }
  //#endregion

  //#region Events (Wrapped to maintain reference equality)
  private onError(event: NativeSyntheticEvent<OnErrorEvent>): void {
    if (this.props.onError != null) {
      const error = event.nativeEvent;
      const cause = isErrorWithCause(error.cause) ? error.cause : undefined;
      this.props.onError(
        // @ts-expect-error We're casting from unknown bridge types to TS unions, I expect it to hopefully work
        new CameraRuntimeError(error.code, error.message, cause),
      );
    }
  }

  private onInitialized(): void {
    this.props.onInitialized?.();
  }

  private onFrameProcessorPerformanceSuggestionAvailable(event: NativeSyntheticEvent<FrameProcessorPerformanceSuggestion>): void {
    if (this.props.onFrameProcessorPerformanceSuggestionAvailable != null)
      this.props.onFrameProcessorPerformanceSuggestionAvailable(event.nativeEvent);
  }
  //#endregion

  //#region Lifecycle
  /** @internal */
  private assertFrameProcessorsEnabled(): void {
    // @ts-expect-error JSI functions aren't typed
    if (global.setFrameProcessor == null || global.unsetFrameProcessor == null) {
      throw new CameraRuntimeError(
        'frame-processor/unavailable',
        'Frame Processors are not enabled. See https://mrousavy.github.io/react-native-vision-camera/docs/guides/troubleshooting',
      );
    }
  }

  private setFrameProcessor(frameProcessor: (frame: Frame) => void): void {
    this.assertFrameProcessorsEnabled();
    // @ts-expect-error JSI functions aren't typed
    global.setFrameProcessor(this.handle, frameProcessor);
  }

  private unsetFrameProcessor(): void {
    this.assertFrameProcessorsEnabled();
    // @ts-expect-error JSI functions aren't typed
    global.unsetFrameProcessor(this.handle);
  }

  private onViewReady(): void {
    this.isNativeViewMounted = true;
    if (this.props.frameProcessor != null) {
      // user passed a `frameProcessor` but we didn't set it yet because the native view was not mounted yet. set it now.
      this.setFrameProcessor(this.props.frameProcessor);
      this.lastFrameProcessor = this.props.frameProcessor;
    }
  }

  /** @internal */
  componentDidUpdate(): void {
    if (!this.isNativeViewMounted) return;
    const frameProcessor = this.props.frameProcessor;
    if (frameProcessor !== this.lastFrameProcessor) {
      // frameProcessor argument identity changed. Update native to reflect the change.
      if (frameProcessor != null) this.setFrameProcessor(frameProcessor);
      else this.unsetFrameProcessor();

      this.lastFrameProcessor = frameProcessor;
    }
  }
  //#endregion

  /** @internal */
  public render(): React.ReactNode {
    // We remove the big `device` object from the props because we only need to pass `cameraId` to native.
    const {
      device,
      frameProcessor,
      frameProcessorFps,
      captureButtonPaddingBottom,
      captureButtonSizeN = 50,
      processingPaddingTop = 20,
      CaptureButton,
      DeleteButton,
      TimerComponent,
      DoneButtonComponent,
      onPressDoneButton,
      ...props
    } = this.props;

    const onPressDoneButtonFunction = () => {
      if (onPressDoneButton) {
        onPressDoneButton(this.state.videos);
        this.initState();
        this.stopTimmer();
      }
    };

    return (
      <View style={props.style}>
        <NativeCameraView
          {...props}
          frameProcessorFps={frameProcessorFps === 'auto' ? -1 : frameProcessorFps}
          cameraId={device.id}
          ref={this.ref}
          onViewReady={this.onViewReady}
          onInitialized={this.onInitialized}
          onError={this.onError}
          onFrameProcessorPerformanceSuggestionAvailable={this.onFrameProcessorPerformanceSuggestionAvailable}
          enableFrameProcessor={frameProcessor != null}
        />
        {this.state.currentTime !== 0 ? (
          <View style={[styles.processBarContainer, props.processBarContainerStyle, { top: processingPaddingTop }]}>
            <Animated.View
              style={[
                styles.animatedBar,
                {
                  width: this.state.processingAnimated.interpolate({
                    inputRange: [0, this.props.maxDurations || this.state.maxDurations],
                    outputRange: ['0%', '100%'],
                  }),
                },
                props.processBarAnimatedStyle,
              ]}
            />
            {this.state.videos.length > 0 &&
              this.state.videos.map((item: VideoFile, index) => {
                return (
                  <View
                    key={index}
                    style={[
                      styles.processingMarker,
                      {
                        width: `${((item.mainTime || 0) / (this.props.maxDurations || this.state.maxDurations)) * 100}%`,
                      },
                    ]}
                  />
                );
              })}
          </View>
        ) : null}
        {this.runderSpeedComponent()}
        {this.runderMaxDurationsComponent()}
        <View style={[styles.captureButton, { bottom: captureButtonPaddingBottom || 50 }]}>
          {CaptureButton ? (
            <CaptureButton
              enabled={true}
              flash="off"
              isRecord={this.state.currentVideoTime !== 0}
              startRecordingFunction={this.startRecording}
              stopRecordingFunction={this.stopRecording}
              isReadyToStop={this.state.currentVideoTime >= 3}
              captureButtonSize={captureButtonSizeN}
            />
          ) : null}
          {this.state.videos.length > 0 && this.state.currentVideoTime === 0 ? (
            DeleteButton ? (
              <DeleteButton onPress={() => this.deleteLastVideo()} />
            ) : (
              <TouchableOpacity
                onPress={() => this.deleteLastVideo()}
                style={[styles.deleteContainer, { right: -captureButtonSizeN + 30 }]}>
                <Image style={styles.deleteImage} source={require('./images/backspace.png')} />
              </TouchableOpacity>
            )
          ) : null}
          {this.state.videos.length > 0 && this.state.currentVideoTime === 0 ? (
            DoneButtonComponent ? (
              <DoneButtonComponent onPress={onPressDoneButtonFunction} />
            ) : (
              <TouchableOpacity onPress={onPressDoneButtonFunction} style={[styles.deleteContainer, { right: -captureButtonSizeN - 30 }]}>
                <Image style={styles.doneImage} source={require('./images/vicon.png')} />
              </TouchableOpacity>
            )
          ) : null}
        </View>
        {TimerComponent ? (
          <TimerComponent time={this.state.currentTime} />
        ) : this.state.currentTime > 0 ? (
          <Text style={[styles.timer, { top: processingPaddingTop + 10 }]}>{this.state.currentTime.toFixed(0)}s</Text>
        ) : null}
      </View>
    );
  }
}
//#endregion

// requireNativeComponent automatically resolves 'CameraView' to 'CameraViewManager'
const NativeCameraView = requireNativeComponent<NativeCameraViewProps>(
  'CameraView',
  // @ts-expect-error because the type declarations are kinda wrong, no?
  Camera,
);

const styles = StyleSheet.create({
  processBarContainer: {
    width: '90%',
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    position: 'absolute',
    alignSelf: 'center',
    justifyContent: 'flex-start',
  },
  animatedBar: {
    height: '100%',
    backgroundColor: '#14AEF2',
    borderRadius: 2,
  },
  captureButton: {
    position: 'absolute',
    alignSelf: 'center',
    justifyContent: 'center',
  },
  processingMarker: {
    position: 'absolute',
    height: '100%',
    borderRightWidth: 3,
    borderColor: 'white',
  },
  speed: { position: 'absolute', alignSelf: 'center', bottom: 180 },
  speedContainer: { height: 35, flexDirection: 'row', borderRadius: 5, backgroundColor: 'rgba(140, 140, 140, 0.3)' },
  textSpeedContainer: {
    height: '100%',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textSpeed: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  textDurationContainer: {
    height: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationContainer: { height: 25, flexDirection: 'row', marginTop: 10 },
  duration: { position: 'absolute', alignSelf: 'center', bottom: 150 },
  backgroundWhite: { backgroundColor: 'white' },
  colorGray: { color: 'gray' },
  backgroundTransparent: { backgroundColor: 'rgba(140, 140, 140, 0.3)' },
  deleteContainer: { position: 'absolute' },
  deleteImage: { width: 30, height: 25 },
  doneImage: { width: 40, height: 40 },
  timer: { position: 'absolute', color: 'white', fontSize: 13, fontWeight: 'bold', alignSelf: 'center' },
});
