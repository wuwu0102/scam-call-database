import 'package:flutter/material.dart';

import '../services/firestore_service.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.service});

  final FirestoreService service;

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _phoneController = TextEditingController();
  final _noteController = TextEditingController();
  String _tag = 'scam';
  bool _saving = false;
  String _message = '';

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _saving = true;
      _message = '';
    });

    try {
      await widget.service.saveReport(
        originalPhone: _phoneController.text.trim(),
        tag: _tag,
        note: _noteController.text.trim(),
      );

      setState(() {
        _message = 'Saved to Firestore';
        _phoneController.clear();
        _noteController.clear();
        _tag = 'scam';
      });
    } catch (_) {
      setState(() {
        _message = 'Save failed. Check Firebase setup.';
      });
    } finally {
      setState(() {
        _saving = false;
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
          DropdownButtonFormField<String>(
            value: _tag,
            items: const [
              DropdownMenuItem(value: 'scam', child: Text('Scam')),
              DropdownMenuItem(value: 'suspicious', child: Text('Suspicious')),
              DropdownMenuItem(value: 'safe', child: Text('Safe')),
              DropdownMenuItem(value: 'unknown', child: Text('Unknown')),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() => _tag = value);
            },
            decoration: const InputDecoration(
              labelText: 'Tag',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _noteController,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving...' : 'Save report'),
          ),
          if (_message.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _message,
              style: TextStyle(color: _message.startsWith('Saved') ? Colors.green : Colors.red),
            ),
          ],
        ],
      ),
    );
  }
}
