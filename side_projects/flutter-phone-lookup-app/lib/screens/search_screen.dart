import 'package:flutter/material.dart';

import '../services/firestore_service.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.service});

  final FirestoreService service;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _phoneController = TextEditingController();
  bool _loading = false;
  static const _allowedTags = {'scam', 'suspicious', 'safe', 'unknown'};

  String _status = 'unknown';
  String _note = '';
  String _message = '';

  Future<void> _search() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _message = '';
      _note = '';
      _status = 'unknown';
    });

    try {
      final record = await widget.service.findLatestByPhone(_phoneController.text.trim());
      setState(() {
        final rawTag = (record?['tag'] ?? 'unknown').toString();
        _status = _allowedTags.contains(rawTag) ? rawTag : 'unknown';
        _note = (record?['note'] ?? '').toString();
      });
    } catch (_) {
      setState(() {
        _message = 'Search failed. Check Firebase setup.';
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone number',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _loading ? null : _search,
            child: Text(_loading ? 'Searching...' : 'Search phone'),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Tag: $_status', style: Theme.of(context).textTheme.titleMedium),
                  if (_note.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Note: $_note'),
                  ],
                ],
              ),
            ),
          ),
          if (_message.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_message, style: const TextStyle(color: Colors.red)),
          ],
        ],
      ),
    );
  }
}
