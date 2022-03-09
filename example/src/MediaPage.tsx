/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Image, ActivityIndicator, PermissionsAndroid, Platform } from 'react-native';
import Video, { LoadError, OnLoadData } from 'react-native-video';
import { SAFE_AREA_PADDING, SCREEN_HEIGHT, SCREEN_WIDTH } from './Constants';
import { useIsForeground } from './hooks/useIsForeground';
import { PressableOpacity } from 'react-native-pressable-opacity';
import IonIcon from 'react-native-vector-icons/Ionicons';
import { Alert } from 'react-native';
import CameraRoll from '@react-native-community/cameraroll';
import { StatusBarBlurBackground } from './views/StatusBarBlurBackground';
import type { NativeSyntheticEvent } from 'react-native';
import type { ImageLoadEventData } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Routes } from './Routes';
import { useIsFocused } from '@react-navigation/core';
import { joinAllVideos } from './VideoFormater';

const requestSavePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  const permission = PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  if (permission == null) return false;
  let hasPermission = await PermissionsAndroid.check(permission);
  if (!hasPermission) {
    const permissionRequestResult = await PermissionsAndroid.request(permission);
    hasPermission = permissionRequestResult === 'granted';
  }
  return hasPermission;
};

const isVideoOnLoadEvent = (event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>): event is OnLoadData =>
  'duration' in event && 'naturalSize' in event;

type Props = NativeStackScreenProps<Routes, 'MediaPage'>;
export function MediaPage({ navigation, route }: Props): React.ReactElement {
  const { path, type } = route.params;
  const isForeground = useIsForeground();
  const isScreenFocused = useIsFocused();
  const isVideoPaused = !isForeground || !isScreenFocused;
  const [savingState, setSavingState] = useState<'none' | 'saving' | 'saved'>('none');
  const [currentVideoURL, setCurrentVideoURL] = useState('');
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [listVideos, setListVideos] = useState([]);
  const currentIndex = useRef(0);

  const onMediaLoad = useCallback((event: OnLoadData | NativeSyntheticEvent<ImageLoadEventData>) => {
    if (isVideoOnLoadEvent(event)) {
      console.log(
        `Video loaded. Size: ${event.naturalSize.width}x${event.naturalSize.height} (${event.naturalSize.orientation}, ${event.duration} seconds)`,
      );
    } else {
      console.log(`Image loaded. Size: ${event.nativeEvent.source.width}x${event.nativeEvent.source.height}`);
    }
  }, []);
  const onMediaLoadEnd = useCallback(() => {
    console.log('media has loaded.');
  }, []);
  const onMediaLoadError = useCallback((error: LoadError) => {
    console.log(`failed to load media: ${JSON.stringify(error)}`);
  }, []);

  const onSavePressed = useCallback(async () => {
    try {
      if (type === 'photo') {
        setSavingState('saving');

        const hasPermission = await requestSavePermission();
        if (!hasPermission) {
          Alert.alert('Permission denied!', 'Vision Camera does not have permission to save the media to your camera roll.');
          return;
        }
        await CameraRoll.save(`file://${path}`, {
          type: type,
        });
        setSavingState('saved');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : JSON.stringify(e);
      setSavingState('none');
      Alert.alert('Failed to save!', `An unexpected error occured while trying to save your ${type}. ${message}`);
    }
  }, [path, type]);

  const source = useMemo(() => {
    if (type === 'photo') {
      return { uri: `file://${path}` };
    } else {
      joinAllVideos(path)
        .then((url: any) => setCurrentVideoURL(url))
        .catch((error: any) => console.log('Error: ', error));
      return { uri: `file://${path}` };
    }
  }, [path, type]);

  return (
    <View style={styles.container}>
      {type === 'photo' && (
        <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" onLoadEnd={onMediaLoadEnd} onLoad={onMediaLoad} />
      )}
      {/* below code used to play one concat video */}
      {type === 'video' &&
        (currentVideoURL !== '' ? (
          <View style={styles.videoContainer}>
            <Video
              key={currentVideoURL}
              source={{
                uri: currentVideoURL,
              }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
              paused={isVideoPaused}
              resizeMode="cover"
              // posterResizeMode="cover"
              allowsExternalPlayback={true}
              automaticallyWaitsToMinimizeStalling={true}
              disableFocus={true}
              // repeat={true}
              useTextureView={false}
              playInBackground={false}
              controls={false}
              playWhenInactive={true}
              ignoreSilentSwitch="ignore"
              onReadyForDisplay={onMediaLoadEnd}
              onLoad={onMediaLoad}
              onError={onMediaLoadError}
            />
          </View>
        ) : (
          <View style={styles.activity}>
            <ActivityIndicator size="large" color="white" />
          </View>
        ))}
      {/* <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: 'black' }}>
        {listVideos.length > 0 ? (
          listVideos.map((item: string, index: number) => (
            <Video
              key={item}
              source={{ uri: item }}
              style={{ width: index !== currentVideoIndex ? 0 : SCREEN_WIDTH, height: index !== currentVideoIndex ? 0 : SCREEN_HEIGHT }}
              paused={isVideoPaused || index !== currentVideoIndex}
              // resizeMode="cover"
              // posterResizeMode="cover"
              allowsExternalPlayback={true}
              automaticallyWaitsToMinimizeStalling={true}
              disableFocus={true}
              repeat={false}
              useTextureView={false}
              playInBackground={false}
              controls={false}
              playWhenInactive={true}
              ignoreSilentSwitch="ignore"
              onReadyForDisplay={onMediaLoadEnd}
              onLoad={onMediaLoad}
              onError={onMediaLoadError}
              onEnd={() => {
                if (currentIndex.current >= path.length - 1) {
                  // currentIndex = 0;
                  // setCurrentVideoIndex(0);
                } else {
                  currentIndex.current = currentIndex.current + 1;
                  setCurrentVideoIndex(currentIndex.current);
                }
              }}
            />
          ))
        ) : (
          <View style={styles.activity}>
            <ActivityIndicator size="large" color="white" />
          </View>
        )}
      </View> */}
      <PressableOpacity
        style={styles.closeButton}
        onPress={() => {
          navigation.goBack();
        }}>
        <IonIcon name="close" size={35} color="white" style={styles.icon} />
      </PressableOpacity>

      <PressableOpacity style={styles.saveButton} onPress={onSavePressed} disabled={savingState !== 'none'}>
        {savingState === 'none' && <IonIcon name="download" size={35} color="white" style={styles.icon} />}
        {savingState === 'saved' && <IonIcon name="checkmark" size={35} color="white" style={styles.icon} />}
        {savingState === 'saving' && <ActivityIndicator color="white" />}
      </PressableOpacity>

      <StatusBarBlurBackground />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: 'black' },
  closeButton: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  saveButton: {
    position: 'absolute',
    bottom: SAFE_AREA_PADDING.paddingBottom,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  icon: {
    textShadowColor: 'black',
    textShadowOffset: {
      height: 0,
      width: 0,
    },
    textShadowRadius: 1,
  },
  activity: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
