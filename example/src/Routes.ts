export type Routes = {
  PermissionsPage: undefined;
  CameraPage: undefined;
  MediaPage: {
    path: string | [any];
    type: 'video' | 'photo';
  };
};
