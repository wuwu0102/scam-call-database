String normalizePhoneNumber(String value) {
  return value.replaceAll(RegExp(r'\\D'), '');
}

List<String> buildPhoneKeys(String value) {
  final normalized = normalizePhoneNumber(value);
  if (normalized.isEmpty) return [];

  final keys = <String>{normalized};
  if (normalized.length == 11 && normalized.startsWith('1')) {
    keys.add(normalized.substring(1));
  }

  return keys.toList();
}

bool isPhoneMatch(String left, String right) {
  final leftKeys = buildPhoneKeys(left);
  final rightKeys = buildPhoneKeys(right);
  return leftKeys.any(rightKeys.contains);
}
