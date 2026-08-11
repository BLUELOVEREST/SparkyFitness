export const resolveExerciseImageSrc = (imagePath: string): string =>
  /^https?:\/\//i.test(imagePath)
    ? imagePath
    : `/uploads/exercises/${imagePath.replace(/^\/?uploads\/exercises\//, '')}`;
