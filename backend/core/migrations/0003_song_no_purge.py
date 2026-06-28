from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_searchsubscription_keyword_blacklist'),
    ]

    operations = [
        migrations.AddField(
            model_name='song',
            name='no_purge',
            field=models.BooleanField(default=False),
        ),
    ]
