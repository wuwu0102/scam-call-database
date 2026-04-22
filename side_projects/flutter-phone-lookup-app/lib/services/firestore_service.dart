import 'package:cloud_firestore/cloud_firestore.dart';

import '../utils/phone_normalizer.dart';

class FirestoreService {
  FirestoreService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;
  static const collectionName = 'phone_numbers';

  Future<Map<String, dynamic>?> findLatestByPhone(String phone) async {
    final normalizedPhone = normalizePhoneNumber(phone);
    if (normalizedPhone.isEmpty) return null;

    final snapshot = await _firestore.collection(collectionName).get();
    Map<String, dynamic>? latest;

    for (final doc in snapshot.docs) {
      final data = doc.data();
      final recordNumber = (data['normalizedNumber'] ?? data['number'] ?? '').toString();
      if (!isPhoneMatch(recordNumber, normalizedPhone)) continue;

      final currentCreatedAt = num.tryParse((data['createdAt'] ?? 0).toString()) ?? 0;
      final latestCreatedAt = num.tryParse((latest?['createdAt'] ?? 0).toString()) ?? 0;
      if (latest == null || currentCreatedAt > latestCreatedAt) {
        latest = data;
      }
    }

    return latest;
  }

  Future<void> saveReport({
    required String originalPhone,
    required String tag,
    String note = '',
  }) async {
    final normalizedPhone = normalizePhoneNumber(originalPhone);
    if (normalizedPhone.isEmpty) {
      throw ArgumentError('Phone number is required');
    }

    await _firestore.collection(collectionName).add({
      'number': originalPhone,
      'normalizedNumber': normalizedPhone,
      'tag': tag,
      'note': note,
      'createdAt': DateTime.now().millisecondsSinceEpoch,
    });
  }
}
