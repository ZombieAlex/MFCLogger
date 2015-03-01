var gulp = require('gulp'),
    gutil = require('gulp-util'),
    coffee = require('gulp-coffee');

gulp.task('default', function(){
    gulp.src('src/*.coffee')
        .pipe(coffee({bare: true}).on('error', gutil.log))
        .pipe(gulp.dest('lib'));
});

gulp.task('watch', function() {
    gulp.watch('src/*.coffee', ['default']);
});
