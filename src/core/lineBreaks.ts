/** Every line ending some reader honours: CommonMark breaks on a lone `\r`, JS `.` refuses U+2028/U+2029. */
export const LINE_BREAKS = /[\r\n\u2028\u2029]+/g;
