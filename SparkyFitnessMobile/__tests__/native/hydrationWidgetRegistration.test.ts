import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('Android hydration widget registration', () => {
  it('registers a 1x1 quick-add hydration widget provider and receiver', () => {
    const plugin = read('plugins/withCalorieWidget.ts');
    const strings = read('targets/android-widget/res/values/widget_strings.xml');
    const receiver = read(
      'targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/HydrationWidgetReceiver.kt.tmpl',
    );
    const widget = read(
      'targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/HydrationWidget.kt.tmpl',
    );
    const provider = read('targets/android-widget/res/xml/sparky_hydration_widget_quick_add_info.xml');

    expect(plugin).toContain('HydrationWidgetQuickAddReceiver');
    expect(plugin).toContain('@string/sparky_hydration_widget_quick_add_name');
    expect(plugin).toContain('@xml/sparky_hydration_widget_quick_add_info');

    expect(strings).toContain('name="sparky_hydration_widget_quick_add_name">Hydration 1x1');

    expect(provider).toContain('android:targetCellWidth="1"');
    expect(provider).toContain('android:targetCellHeight="1"');
    expect(provider).toContain('android:minResizeWidth="70dp"');
    expect(provider).toContain('android:minResizeHeight="70dp"');

    expect(receiver).toContain('HydrationWidgetQuickAddReceiver::class.java');
    expect(receiver).toContain('class HydrationWidgetQuickAddReceiver : HydrationWidgetReceiver()');
    expect(widget).toContain('QuickAddLayout(context)');
    expect(widget).toContain('AmountButton(context, "+250", 250');
  });
});
